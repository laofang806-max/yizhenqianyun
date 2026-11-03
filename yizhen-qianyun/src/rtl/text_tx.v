// 将状态消息序列化为换行结尾的 ASCII 文本。
module text_tx #(
    parameter TELEMETRY_ENABLE = 0,
    parameter REPORT_CYCLES = 10_000_000
) (
    input clk,
    input rst_n,
    input request,
    input [3:0] message,
    input [2:0] color,
    input [15:0] probe_id,
    input [31:0] encoder_x,
    input [31:0] encoder_y,
    input uart_busy,
    output reg uart_start,
    output reg [7:0] uart_data,
    output reg busy
);
    reg [175:0] text;
    reg [4:0] length, index;
    reg [3:0] pending_message;
    reg [2:0] pending_color;
    reg pending;
    reg [15:0] pending_probe;
    localparam T_IDLE = 2'd0, T_LAUNCH = 2'd1, T_WAIT = 2'd2;
    reg [1:0] state;
    reg [31:0] report_timer;
    wire report_due = TELEMETRY_ENABLE && report_timer >= REPORT_CYCLES-1;
    function [63:0] hex32;
        input [31:0] value;
        integer i;
        reg [3:0] nibble;
        begin
            for (i=0; i<8; i=i+1) begin
                nibble = value[4*i +: 4];
                hex32[8*i +: 8] = (nibble < 10) ? (8'h30+nibble) : (8'h41+nibble-10);
            end
        end
    endfunction
    // Saturating timer: reports are low priority and snapshot both counts atomically.
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) report_timer <= 0;
        else if (state == T_IDLE && !pending && !request && report_due) report_timer <= 0;
        else if (!report_due) report_timer <= report_timer + 1'b1;
    end


    function [31:0] hex16;
      input [15:0] v;
      integer j; reg [3:0] n;
      begin for(j=0;j<4;j=j+1)begin n=v[j*4+:4];hex16[j*8+:8]=(n<10)?8'h30+n:8'h41+n-10;end end
    endfunction
    function [175:0] make_text;
        input [3:0] id;
        input [2:0] color_id;
        input [15:0] tag;
        begin
            case (id)
                0: make_text = "READY\n";
                1: begin
                    case (color_id)
                        1: make_text = "OK black\n";
                        2: make_text = "OK red\n";
                        3: make_text = "OK yellow\n";
                        5: make_text = "OK layer\n";
                        default: make_text = "OK blue\n";
                    endcase
                end
                2: make_text = "NEXT\n";
                3: begin
                    case (color_id)
                        1: make_text = "DONE black\n";
                        2: make_text = "DONE red\n";
                        3: make_text = "DONE yellow\n";
                        5: make_text = "DONE layer\n";
                        default: make_text = "DONE blue\n";
                    endcase
                end
                4: make_text = "ALL DONE\n";
                5: make_text = "ESTOP\n";
                6: make_text = "ERR protocol\n";
                7: make_text = "ERR stall\n";
                8: make_text = "BUSY\n";
                9: make_text = "ERR home\n";
                10: make_text = "ERR range\n";
                11: make_text = "CORRECT\n";
                12: make_text = "ERR feedback\n";
                13: make_text = "CAL READY\n";
                14: make_text = "CAL DONE\n";
                15: make_text = (color_id==7) ? {"PONG ",hex16(tag),8'h0a} : "CAP LAYER RESET PING\n";
                default: make_text = "BUSY\n";
            endcase
        end
    endfunction

    function [4:0] message_length;
        input [3:0] id;
        input [2:0] color_id;
        begin
            case (id)
                0: message_length = 6;
                1: message_length = (color_id == 1) ? 9 :
                                    (color_id == 2) ? 7 :
                                    (color_id == 3) ? 10 : (color_id==5)?9:8;
                2: message_length = 5;
                3: message_length = (color_id == 1) ? 11 :
                                    (color_id == 2) ? 9 :
                                    (color_id == 3) ? 12 : (color_id==5)?11:10;
                4: message_length = 9;
                5: message_length = 6;
                6: message_length = 13;
                7: message_length = 10;
                8: message_length = 5;
                9: message_length = 9;
                10: message_length = 10;
                11: message_length = 8;
                12: message_length = 13;
                13: message_length = 10;
                14: message_length = 9;
                15: message_length = (color_id==7)?10:21;
                default: message_length = 5;
            endcase
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            text <= 0; length <= 0; index <= 0; pending_message <= 0;
            pending_color <= 0; pending_probe<=0; pending <= 0; state <= T_IDLE;
            uart_start <= 0; uart_data <= 0; busy <= 0;
        end else begin
            uart_start <= 1'b0;
            if (request && state != T_IDLE) begin
                pending_message <= message;
                pending_color <= color; pending_probe<=probe_id;
                pending <= 1'b1;
            end
            case (state)
                T_IDLE: begin
                    if (pending) begin
                        text <= make_text(pending_message, pending_color, pending_probe);
                        // Preserve a new control response while consuming the queued one.
                        if (request) begin
                            pending_message <= message;
                            pending_color <= color; pending_probe<=probe_id;
                        end
                        length <= message_length(pending_message, pending_color);
                        index <= 0;
                        pending <= request;
                        busy <= 1'b1;
                        state <= T_LAUNCH;
                    end else if (request) begin
                        text <= make_text(message, color, probe_id);
                        length <= message_length(message, color);
                        index <= 0;
                        busy <= 1'b1;
                        state <= T_LAUNCH;
                    end else if (report_due) begin
                        text <= {"ENC ", hex32(encoder_x), " ", hex32(encoder_y), 8'h0a};
                        length <= 22;
                        index <= 0;
                        busy <= 1'b1;
                        state <= T_LAUNCH;
                    end
                end
                T_LAUNCH: begin
                    if (!uart_busy) begin
                        uart_data <= text[8*(length-index-1) +: 8];
                        uart_start <= 1'b1;
                        state <= T_WAIT;
                    end
                end
                T_WAIT: begin
                    if (!uart_busy && !uart_start) begin
                        if (index + 1 >= length) begin
                            busy <= 1'b0;
                            state <= T_IDLE;
                        end else begin
                            index <= index + 1'b1;
                            state <= T_LAUNCH;
                        end
                    end
                end
                default: state <= T_IDLE;
            endcase
        end
    end
endmodule

