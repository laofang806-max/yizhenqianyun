module ft232h_stream_start (
    input wire usb_clk_60m,
    input wire rst_n,
    input wire usb_rxf_n,
    input wire [7:0] usb_data_in,
    output wire usb_oe_n,
    output wire usb_rd_n,
    output reg stream_enable
);
    localparam [1:0] RX_IDLE = 2'd0;
    localparam [1:0] RX_OE_SETUP = 2'd1;
    localparam [1:0] RX_READ = 2'd2;
    reg [1:0] state;

    assign usb_oe_n = (state == RX_IDLE);
    assign usb_rd_n = (state != RX_READ);

    always @(posedge usb_clk_60m or negedge rst_n) begin
        if (!rst_n) begin
            state <= RX_IDLE;
            stream_enable <= 1'b0;
        end else begin
            case (state)
                RX_IDLE: begin
                    if (!usb_rxf_n) state <= RX_OE_SETUP;
                end
                RX_OE_SETUP: state <= RX_READ;
                RX_READ: begin
                    if (!usb_rxf_n) begin
                        if (usb_data_in == 8'h53) stream_enable <= 1'b1;
                        else if (usb_data_in == 8'h50) stream_enable <= 1'b0;
                    end
                    state <= RX_IDLE;
                end
                default: state <= RX_IDLE;
            endcase
        end
    end
endmodule