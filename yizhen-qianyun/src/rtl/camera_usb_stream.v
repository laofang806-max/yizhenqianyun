module camera_usb_stream #(
    parameter FRAME_WIDTH = 640,
    parameter FRAME_HEIGHT = 480,
    parameter FRAME_DIVIDER = 3,
    parameter FIFO_ADDR_WIDTH = 18,
    parameter VSYNC_ACTIVE_LEVEL = 1
) (
    input wire rst_n,
    input wire cam_pclk,
    input wire cam_href,
    input wire cam_vsync,
    input wire [7:0] cam_data,
    input wire usb_clk_60m,
    input wire usb_txe_n,
    input wire stream_enable,
    input wire capture_pulse,
    output reg capture_done,
    output wire stream_active,
    output reg overflow,
    output wire usb_wr_n,
    output wire usb_oe_n,
    output wire usb_rd_n,
    output wire usb_siwu_n,
    output wire usb_data_oe,
    output wire [7:0] usb_data_out,
    output wire packet_idle
);
    localparam [1:0] TOKEN_DATA = 2'b00;
    localparam [1:0] TOKEN_FRAME_START = 2'b01;
    localparam [1:0] TOKEN_FRAME_END = 2'b10;
    localparam [7:0] TYPE_FRAME = 8'd1;
    localparam [7:0] TYPE_CAPTURE = 8'd2;
    localparam [31:0] FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 2;
    localparam ROW_WIDTH = (FRAME_HEIGHT < 2) ? 1 : $clog2(FRAME_HEIGHT + 1);

    reg stream_enable_sync1, stream_enable_sync2;
    reg cam_vsync_previous, cam_href_previous, frame_active;
    reg [ROW_WIDTH-1:0] line_count;
    reg [7:0] frame_divider_count;
    reg fifo_wr_en;
    reg [8:0] fifo_wr_data;
    wire fifo_full, fifo_empty;
    wire fifo_wr_rst_n = rst_n && stream_enable_sync2;
    wire fifo_rd_rst_n = rst_n && stream_enable;
    wire [8:0] fifo_rd_data;
    wire fifo_rd_valid;
    reg fifo_rd_en;
    reg fifo_read_pending, token_valid;
    reg [9:0] token_buffer;

    wire frame_start = (cam_vsync == VSYNC_ACTIVE_LEVEL) &&
                       (cam_vsync_previous != VSYNC_ACTIVE_LEVEL);
    wire line_end = cam_href_previous && !cam_href;

    always @(posedge cam_pclk or negedge rst_n) begin
        if (!rst_n) begin
            stream_enable_sync1 <= 1'b0;
            stream_enable_sync2 <= 1'b0;
            cam_vsync_previous <= ~VSYNC_ACTIVE_LEVEL;
            cam_href_previous <= 1'b0;
            frame_active <= 1'b0;
            line_count <= 0;
            frame_divider_count <= 0;
            fifo_wr_en <= 1'b0;
            fifo_wr_data <= 9'd0;
            overflow <= 1'b0;
        end else begin
            stream_enable_sync1 <= stream_enable;
            stream_enable_sync2 <= stream_enable_sync1;
            cam_vsync_previous <= cam_vsync;
            cam_href_previous <= cam_href;
            fifo_wr_en <= 1'b0;

            if (!stream_enable_sync2) begin
                frame_active <= 1'b0;
            end else if (frame_start) begin
                frame_active <= frame_divider_count == 0;
                line_count <= 0;
                if (frame_divider_count + 1 >= FRAME_DIVIDER)
                    frame_divider_count <= 0;
                else
                    frame_divider_count <= frame_divider_count + 1'b1;
                if (frame_divider_count == 0 && !fifo_full) begin
                    fifo_wr_en <= 1'b1;
                    fifo_wr_data <= {1'b1, 8'h00};
                end else if (frame_divider_count == 0) begin
                    overflow <= 1'b1;
                end
            end else if (line_end) begin
                if (line_count + 1 >= FRAME_HEIGHT) begin
                    line_count <= 0;
                    frame_active <= 1'b0;
                end else line_count <= line_count + 1'b1;
                if (frame_active && line_count + 1 >= FRAME_HEIGHT && !fifo_full) begin
                    fifo_wr_en <= 1'b1;
                    fifo_wr_data <= {1'b1, 8'h01};
                end else if (frame_active && line_count + 1 >= FRAME_HEIGHT) begin
                    overflow <= 1'b1;
                end
            end else if (frame_active && cam_href) begin
                if (!fifo_full) begin
                    fifo_wr_en <= 1'b1;
                    fifo_wr_data <= {1'b0, cam_data};
                end else begin
                    overflow <= 1'b1;
                end
            end
        end
    end

    async_fifo_gray #(
        .DATA_WIDTH(9),
        .ADDR_WIDTH(FIFO_ADDR_WIDTH)
    ) camera_fifo (
        .wr_rst_n(fifo_wr_rst_n),
        .wr_clk(cam_pclk),
        .wr_en(fifo_wr_en),
        .wr_data(fifo_wr_data),
        .full(fifo_full),
        .rd_rst_n(fifo_rd_rst_n),
        .rd_clk(usb_clk_60m),
        .rd_en(fifo_rd_en),
        .rd_data(fifo_rd_data),
        .rd_valid(fifo_rd_valid),
        .empty(fifo_empty)
    );

    localparam [1:0] TX_IDLE = 2'd0;
    localparam [1:0] TX_HEADER = 2'd1;
    localparam [1:0] TX_FRAME = 2'd2;
    localparam [1:0] TX_PAD = 2'd3;
    localparam [2:0] TX_WAIT_END = 3'd4;

    reg [2:0] tx_state;
    reg [4:0] header_index;
    reg [7:0] header_type;
    reg [31:0] header_sequence, frame_sequence, payload_index;
    reg capture_pending, stream_started, capture_finished;
    reg flush_packet;
    wire can_write = !usb_txe_n;
    wire [1:0] token_kind = token_buffer[9:8];
    wire [7:0] header_byte;
    wire needs_token = (tx_state == TX_IDLE) || (tx_state == TX_FRAME) ||
                       (tx_state == TX_WAIT_END);
    wire consume_token = token_valid && (
        (tx_state == TX_IDLE) ||
        (tx_state == TX_FRAME &&
         (token_kind == TOKEN_FRAME_END ||
          (token_kind == TOKEN_DATA && can_write))) ||
        (tx_state == TX_WAIT_END && token_kind != TOKEN_FRAME_START)
    );

    function [7:0] get_header_byte;
        input [4:0] index;
        input [7:0] packet_type;
        input [31:0] packet_sequence;
        input [31:0] payload_length;
        begin
            case (index)
                0: get_header_byte = 8'h4f;
                1: get_header_byte = 8'h56;
                2: get_header_byte = 8'h35;
                3: get_header_byte = 8'h36;
                4: get_header_byte = 8'd1;
                5: get_header_byte = packet_type;
                6: get_header_byte = FRAME_WIDTH[7:0];
                7: get_header_byte = FRAME_WIDTH[15:8];
                8: get_header_byte = FRAME_HEIGHT[7:0];
                9: get_header_byte = FRAME_HEIGHT[15:8];
                10: get_header_byte = 8'd1;
                11: get_header_byte = 8'd0;
                12: get_header_byte = packet_sequence[7:0];
                13: get_header_byte = packet_sequence[15:8];
                14: get_header_byte = packet_sequence[23:16];
                15: get_header_byte = packet_sequence[31:24];
                16: get_header_byte = payload_length[7:0];
                17: get_header_byte = payload_length[15:8];
                18: get_header_byte = payload_length[23:16];
                19: get_header_byte = payload_length[31:24];
                default: get_header_byte = 8'h00;
            endcase
        end
    endfunction

    assign header_byte = get_header_byte(
        header_index,
        header_type,
        header_sequence,
        header_type == TYPE_FRAME ? FRAME_BYTES : 32'd0
    );
    assign usb_wr_n = (tx_state == TX_HEADER) ||
                      (tx_state == TX_FRAME && token_valid &&
                       token_kind == TOKEN_DATA) ||
                      (tx_state == TX_PAD) ? 1'b0 : 1'b1;
    assign usb_oe_n = 1'b1;
    assign usb_rd_n = 1'b1;
    assign usb_siwu_n = !flush_packet;
    assign usb_data_oe = !usb_wr_n;
    assign stream_active = stream_started && !capture_finished;
    assign packet_idle = tx_state == TX_IDLE;
    assign usb_data_out = tx_state == TX_HEADER ? header_byte :
                          (tx_state == TX_FRAME && token_kind == TOKEN_DATA) ? token_buffer[7:0] :
                          8'h00;

    always @* begin
        fifo_rd_en = 1'b0;
        if (needs_token && !fifo_read_pending && !token_valid && !fifo_empty)
            fifo_rd_en = 1'b1;
    end

    always @(posedge usb_clk_60m or negedge rst_n) begin
        if (!rst_n || !stream_enable) begin
            fifo_read_pending <= 1'b0;
            token_valid <= 1'b0;
            token_buffer <= 10'd0;
        end else begin
            if (fifo_rd_en) fifo_read_pending <= 1'b1;
            if (fifo_rd_valid) begin
                fifo_read_pending <= 1'b0;
                // 9-bit FIFO packing: 0xxxxxxxx=data; 100000000=SOF;
                // 100000001=EOF. Restore the existing token interface losslessly.
                token_buffer <= fifo_rd_data[8]
                    ? {fifo_rd_data[0] ? TOKEN_FRAME_END : TOKEN_FRAME_START, 8'h00}
                    : {TOKEN_DATA, fifo_rd_data[7:0]};
                token_valid <= 1'b1;
            end else if (consume_token) begin
                token_valid <= 1'b0;
            end
        end
    end

    always @(posedge usb_clk_60m or negedge rst_n) begin
        if (!rst_n || !stream_enable) begin
            tx_state <= TX_IDLE;
            header_index <= 0;
            header_type <= TYPE_FRAME;
            header_sequence <= 0;
            frame_sequence <= 0;
            payload_index <= 0;
            capture_pending <= 0;
            stream_started <= 0;
            capture_finished <= 0;
            capture_done <= 0;
            flush_packet <= 0;
        end else begin
            capture_done <= 1'b0;
            flush_packet <= 1'b0;

            if (stream_enable && !stream_started && !capture_finished)
                stream_started <= 1'b1;
            if (capture_pulse && stream_started) capture_pending <= 1'b1;

            case (tx_state)
                TX_IDLE: begin
                    if (token_valid) begin
                        if (token_kind == TOKEN_FRAME_START && stream_started) begin
                            frame_sequence <= frame_sequence + 1'b1;
                            header_type <= TYPE_FRAME;
                            header_sequence <= frame_sequence + 1'b1;
                            header_index <= 0;
                            payload_index <= 0;
                            tx_state <= TX_HEADER;
                        end
                    end
                end
                TX_HEADER: begin
                    if (can_write) begin
                        if (header_index == 5'd19) begin
                            if (header_type == TYPE_FRAME) begin
                                tx_state <= TX_FRAME;
                            end else begin
                                tx_state <= TX_IDLE;
                                flush_packet <= 1'b1;
                                capture_done <= 1'b1;
                                stream_started <= 1'b1;
                                capture_finished <= 1'b0;
                                capture_pending <= 1'b0;
                            end
                        end else header_index <= header_index + 1'b1;
                    end
                end
                TX_FRAME: begin
                    if (token_valid) begin
                        if (token_kind == TOKEN_DATA && can_write) begin
                            if (payload_index + 1'b1 >= FRAME_BYTES) begin
                                payload_index <= payload_index + 1'b1;
                                tx_state <= TX_WAIT_END;
                            end else payload_index <= payload_index + 1'b1;
                        end else if (token_kind == TOKEN_FRAME_START) begin
                            // Retain the next START while completing the damaged packet.
                            tx_state <= TX_PAD;
                        end else if (token_kind == TOKEN_FRAME_END) begin
                            if (payload_index < FRAME_BYTES) begin
                                tx_state <= TX_PAD;
                            end else if (capture_pending) begin
                                header_type <= TYPE_CAPTURE;
                                header_sequence <= frame_sequence;
                                header_index <= 0;
                                tx_state <= TX_HEADER;
                            end else begin
                                tx_state <= TX_IDLE;
                                flush_packet <= 1'b1;
                            end
                        end
                    end
                end
                TX_PAD: begin
                    if (can_write) begin
                        if (payload_index + 1'b1 >= FRAME_BYTES) begin
                            payload_index <= payload_index + 1'b1;
                            // The early END was already consumed. Do not wait for it again,
                            // and never emit a capture event for an incomplete frame.
                            tx_state <= TX_IDLE;
                            flush_packet <= 1'b1;
                        end else payload_index <= payload_index + 1'b1;
                    end
                end
                TX_WAIT_END: begin
                    if (token_valid && token_kind == TOKEN_FRAME_START) begin
                        tx_state <= TX_IDLE;
                        flush_packet <= 1'b1;
                    end else if (token_valid && token_kind == TOKEN_DATA) begin
                        // Discard excess bytes, and defer capture to the next valid frame.
                        capture_pending <= 1'b0;
                    end else if (token_valid && token_kind == TOKEN_FRAME_END) begin
                        if (capture_pending) begin
                            header_type <= TYPE_CAPTURE;
                            header_sequence <= frame_sequence;
                            header_index <= 0;
                            tx_state <= TX_HEADER;
                        end else begin
                            tx_state <= TX_IDLE;
                            flush_packet <= 1'b1;
                        end
                    end
                end
                default: tx_state <= TX_IDLE;
            endcase
        end
    end
endmodule

module async_fifo_gray #(
    parameter DATA_WIDTH = 10,
    parameter ADDR_WIDTH = 18
) (
    input wire wr_rst_n,
    input wire wr_clk,
    input wire wr_en,
    input wire [DATA_WIDTH-1:0] wr_data,
    output wire full,
    input wire rd_clk,
    input wire rd_en,
    output reg [DATA_WIDTH-1:0] rd_data,
    output reg rd_valid,
    input wire rd_rst_n,
    output wire empty
);
    localparam PTR_WIDTH = ADDR_WIDTH + 1;
    localparam DEPTH = 1 << ADDR_WIDTH;
    (* ram_style = "block" *) reg [DATA_WIDTH-1:0] memory [0:DEPTH-1];
    reg [PTR_WIDTH-1:0] wr_bin, wr_gray, rd_bin, rd_gray;
    reg [PTR_WIDTH-1:0] rd_gray_sync1, rd_gray_sync2;
    reg [PTR_WIDTH-1:0] wr_gray_sync1, wr_gray_sync2;
    reg full_reg, empty_reg;
    wire write_fire = wr_en && !full_reg;
    wire read_fire = rd_en && !empty_reg;
    wire [PTR_WIDTH-1:0] wr_bin_next = wr_bin + write_fire;
    wire [PTR_WIDTH-1:0] rd_bin_next = rd_bin + read_fire;
    wire [PTR_WIDTH-1:0] wr_gray_next = (wr_bin_next >> 1) ^ wr_bin_next;
    wire [PTR_WIDTH-1:0] rd_gray_next = (rd_bin_next >> 1) ^ rd_bin_next;
    wire full_next = wr_gray_next == {
        ~rd_gray_sync2[PTR_WIDTH-1:PTR_WIDTH-2],
        rd_gray_sync2[PTR_WIDTH-3:0]
    };
    wire empty_next = rd_gray_next == wr_gray_sync2;

    assign full = full_reg;
    assign empty = empty_reg;

    // Dual-clock block RAM has no asynchronous reset. Reset the FIFO pointers
    // and valid flag separately; stale RAM words are never marked as valid.
    always @(posedge wr_clk) begin
        if (wr_rst_n && write_fire)
            memory[wr_bin[ADDR_WIDTH-1:0]] <= wr_data;
    end

    always @(posedge rd_clk) begin
        if (rd_rst_n && read_fire)
            rd_data <= memory[rd_bin[ADDR_WIDTH-1:0]];
    end

    always @(posedge wr_clk or negedge wr_rst_n) begin
        if (!wr_rst_n) begin
            wr_bin <= 0;
            wr_gray <= 0;
            rd_gray_sync1 <= 0;
            rd_gray_sync2 <= 0;
            full_reg <= 1'b0;
        end else begin
            rd_gray_sync1 <= rd_gray;
            rd_gray_sync2 <= rd_gray_sync1;
            wr_bin <= wr_bin_next;
            wr_gray <= wr_gray_next;
            full_reg <= full_next;
        end
    end

    always @(posedge rd_clk or negedge rd_rst_n) begin
        if (!rd_rst_n) begin
            rd_bin <= 0;
            rd_gray <= 0;
            wr_gray_sync1 <= 0;
            wr_gray_sync2 <= 0;
            empty_reg <= 1'b1;
            rd_valid <= 1'b0;
        end else begin
            wr_gray_sync1 <= wr_gray;
            wr_gray_sync2 <= wr_gray_sync1;
            rd_bin <= rd_bin_next;
            rd_gray <= rd_gray_next;
            empty_reg <= empty_next;
            rd_valid <= read_fire;
        end
    end
endmodule

// Insert zero-payload OV56 type-3 status packets only between video packets.
// This path intentionally does not depend on camera PCLK or initialization.
module camera_status_mux #(
    parameter INTERVAL_CYCLES = 60_000_000,
    parameter FRAME_WIDTH = 640,
    parameter FRAME_HEIGHT = 480
) (
    input wire clk, rst_n, enable, txe_n, rx_oe_n,
    input wire video_idle, video_wr_n, video_data_oe, video_siwu_n,
    input wire [7:0] video_data,
    input wire [31:0] status_flags,
    input wire [31:0] readback_value, data_activity,
    output wire video_block,
    output wire wr_n, data_oe, siwu_n,
    output wire [7:0] data_out
);
    localparam TIMER_WIDTH = INTERVAL_CYCLES < 2 ? 1 : $clog2(INTERVAL_CYCLES);
    reg [TIMER_WIDTH-1:0] timer;
    reg active, pending, was_enabled, flush;
    reg [4:0] index;
    reg [31:0] snapshot, readback_snapshot, activity_snapshot;
    reg [1:0] packet_kind;
    wire [31:0] packet_value = packet_kind==0 ? snapshot : packet_kind==1 ? readback_snapshot : activity_snapshot;
    wire start_status = enable && pending && !active && video_idle;
    wire can_write = !txe_n && rx_oe_n;
    reg [7:0] header;
    always @* begin
        case(index)
            0: header=8'h4f; 1: header=8'h56;
            2: header=8'h35; 3: header=8'h36;
            4: header=8'd1; 5: header=8'd3+packet_kind;
            6: header=FRAME_WIDTH[7:0]; 7: header=FRAME_WIDTH[15:8];
            8: header=FRAME_HEIGHT[7:0]; 9: header=FRAME_HEIGHT[15:8];
            10: header=8'd1; 11: header=8'd0;
            12: header=packet_value[7:0]; 13: header=packet_value[15:8];
            14: header=packet_value[23:16]; 15: header=packet_value[31:24];
            default: header=8'd0;
        endcase
    end
    assign video_block = active || start_status;
    assign wr_n = !rx_oe_n ? 1'b1 : active ? 1'b0 : (start_status ? 1'b1 : video_wr_n);
    assign data_oe = rx_oe_n && (active || (!start_status && video_data_oe));
    assign data_out = active ? header : video_data;
    assign siwu_n = !flush && video_siwu_n;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            timer<=0; active<=0; pending<=0; was_enabled<=0;
            flush<=0; index<=0; snapshot<=0;readback_snapshot<=0;activity_snapshot<=0;packet_kind<=0;
        end else if (!enable) begin
            timer<=0; active<=0; pending<=0; was_enabled<=0;
            flush<=0; index<=0; snapshot<=0;readback_snapshot<=0;activity_snapshot<=0;packet_kind<=0;
        end else begin
            was_enabled<=1;
            flush<=0;
            if (!was_enabled || timer >= INTERVAL_CYCLES-1) begin
                timer<=0;
                pending<=1;
            end else timer<=timer+1'b1;
            if (start_status) begin
                pending<=0;
                active<=1;
                index<=0;
                snapshot<=status_flags;readback_snapshot<=readback_value;activity_snapshot<=data_activity;packet_kind<=0;
            end else if (active && can_write) begin
                if (index==19) begin
                    index<=0;
                    if(packet_kind==2) begin active<=0;flush<=1;end
                    else packet_kind<=packet_kind+1'b1;
                end else index<=index+1'b1;
            end
        end
    end
endmodule

// One-byte elastic output register. FT232H accepts on WR#==0 && TXE#==0.
// Keeping data/WR stable throughout a stall avoids a late TXE-to-output path.
module ft232h_tx_register(
 input wire clk,rst_n,txe_n,rxf_n,rx_oe_n,
 input wire source_wr_n,source_siwu_n,
 input wire [7:0] source_data,
 output wire source_ready,busy,
 (* IOB="TRUE" *) output reg wr_n,
 (* IOB="TRUE" *) output reg [7:0] data_out,
 output wire data_oe,
 output reg siwu_n
);
 wire take=!wr_n && !txe_n && rx_oe_n;
 assign busy=!wr_n;
 assign source_ready=rx_oe_n && rxf_n && (wr_n || take);
 wire put=source_ready && !source_wr_n;
 wire next_valid=put || (!wr_n && !take);
 reg flush_pending;
 assign data_oe=!wr_n;
 always @(posedge clk or negedge rst_n) begin
  if(!rst_n)begin wr_n<=1;data_out<=0;siwu_n<=1;flush_pending<=0;end
  else begin
   wr_n<=!next_valid;
   if(put)data_out<=source_data;
   siwu_n<=1;
   if(!source_siwu_n)flush_pending<=1;
   if((flush_pending || !source_siwu_n) && !next_valid)begin
    siwu_n<=0;flush_pending<=0;
   end
  end
 end
endmodule
