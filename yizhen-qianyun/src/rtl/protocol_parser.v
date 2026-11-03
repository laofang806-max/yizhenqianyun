module protocol_parser #(
    parameter LINE_MAX = 64
) (
    input wire clk,
    input wire rst_n,
    input wire rx_valid,
    input wire [7:0] rx_data,
    output reg line_valid,
    output reg line_error,
    output reg is_color,
    output reg is_status,
    output reg is_calibration,
    output reg is_reset, is_capability, is_ping,
    output reg [15:0] probe_id,
    output reg [2:0] color,
    output reg [12:0] point_count,
    output reg action_stitch,
    output reg signed [15:0] dx,
    output reg signed [15:0] dy
);

    localparam [1:0] PARSE_IDLE = 2'd0;
    localparam [1:0] PARSE_COLOR_COUNT = 2'd1;
    localparam [1:0] PARSE_ACTION_X = 2'd2;
    localparam [1:0] PARSE_ACTION_Y = 2'd3;

    reg [7:0] line_mem [0:LINE_MAX-1];
    reg [6:0] line_len;
    reg [6:0] effective_len;
    reg [6:0] parse_cursor;
    reg overflow;
    reg [1:0] parse_state;

    reg [12:0] count_value;
    reg [15:0] number_value;
    reg [5:0] digit_count;
    reg number_negative;
    reg sign_allowed;
    reg parse_error;
    reg signed [15:0] parsed_dx;

    integer effective_len_tmp;
    integer cursor_tmp;
    reg [2:0] selected_color;

    function [4:0] hex_digit;
      input [7:0] c;
      begin
        if(c>="0" && c<="9")hex_digit=c-"0";
        else if(c>="A" && c<="F")hex_digit=c-"A"+10;
        else if(c>="a" && c<="f")hex_digit=c-"a"+10;
        else hex_digit=16;
      end
    endfunction
    // 每个时钟只解析一个字符，避免在换行周期展开整行的组合运算。
    always @(posedge clk) begin
        if (!rst_n) begin
            line_len <= 0;
            effective_len <= 0;
            parse_cursor <= 0;
            overflow <= 0;
            parse_state <= PARSE_IDLE;
            count_value <= 0;
            number_value <= 0;
            digit_count <= 0;
            number_negative <= 0;
            sign_allowed <= 0;
            parse_error <= 0;
            parsed_dx <= 0;
            line_valid <= 0;
            line_error <= 0;
            is_color <= 0;
            is_status <= 0;
            is_calibration <= 0;
            is_reset<=0; is_capability<=0; is_ping<=0; probe_id<=0;
            color <= 0;
            point_count <= 0;
            action_stitch <= 0;
            dx <= 0;
            dy <= 0;
        end else begin
            line_valid <= 0;

            if (parse_state == PARSE_COLOR_COUNT) begin
                if (parse_cursor < effective_len) begin
                    parse_cursor <= parse_cursor + 1'b1;
                    if (line_mem[parse_cursor] >= "0" &&
                        line_mem[parse_cursor] <= "9") begin
                        if (count_value > 13'd409 ||
                            (count_value == 13'd409 &&
                             line_mem[parse_cursor] - "0" > 8'd6)) begin
                            parse_error <= 1;
                        end else begin
                            count_value <= count_value * 10 +
                                           (line_mem[parse_cursor] - "0");
                        end
                        digit_count <= digit_count + 1'b1;
                    end else begin
                        parse_error <= 1;
                    end
                end else begin
                    line_valid <= 1;
                    parse_state <= PARSE_IDLE;
                    if (!parse_error && digit_count != 0) begin
                        point_count <= count_value;
                        line_error <= 0;
                    end else begin
                        line_error <= 1;
                    end
                end
            end else if (parse_state == PARSE_ACTION_X) begin
                if (parse_cursor < effective_len) begin
                    parse_cursor <= parse_cursor + 1'b1;
                    if (line_mem[parse_cursor] == ",") begin
                        if (digit_count == 0)
                            parse_error <= 1;
                        else if (number_negative)
                            parsed_dx <= -$signed({1'b0, number_value});
                        else
                            parsed_dx <= $signed({1'b0, number_value});

                        parse_state <= PARSE_ACTION_Y;
                        number_value <= 0;
                        digit_count <= 0;
                        number_negative <= 0;
                        sign_allowed <= 1;
                    end else if ((line_mem[parse_cursor] == "-" ||
                                  line_mem[parse_cursor] == "+") &&
                                 sign_allowed) begin
                        number_negative <= (line_mem[parse_cursor] == "-");
                        sign_allowed <= 0;
                    end else if (line_mem[parse_cursor] >= "0" &&
                                 line_mem[parse_cursor] <= "9") begin
                        if (number_value > 16'd3276 ||
                            (number_value == 16'd3276 &&
                             line_mem[parse_cursor] - "0" >
                             (number_negative ? 8'd8 : 8'd7))) begin
                            parse_error <= 1;
                        end else begin
                            number_value <= number_value * 10 +
                                            (line_mem[parse_cursor] - "0");
                        end
                        digit_count <= digit_count + 1'b1;
                        sign_allowed <= 0;
                    end else begin
                        parse_error <= 1;
                    end
                end else begin
                    line_valid <= 1;
                    line_error <= 1;
                    parse_state <= PARSE_IDLE;
                end
            end else if (parse_state == PARSE_ACTION_Y) begin
                if (parse_cursor < effective_len) begin
                    parse_cursor <= parse_cursor + 1'b1;
                    if ((line_mem[parse_cursor] == "-" ||
                         line_mem[parse_cursor] == "+") &&
                        sign_allowed) begin
                        number_negative <= (line_mem[parse_cursor] == "-");
                        sign_allowed <= 0;
                    end else if (line_mem[parse_cursor] >= "0" &&
                                 line_mem[parse_cursor] <= "9") begin
                        if (number_value > 16'd3276 ||
                            (number_value == 16'd3276 &&
                             line_mem[parse_cursor] - "0" >
                             (number_negative ? 8'd8 : 8'd7))) begin
                            parse_error <= 1;
                        end else begin
                            number_value <= number_value * 10 +
                                            (line_mem[parse_cursor] - "0");
                        end
                        digit_count <= digit_count + 1'b1;
                        sign_allowed <= 0;
                    end else begin
                        parse_error <= 1;
                    end
                end else begin
                    line_valid <= 1;
                    parse_state <= PARSE_IDLE;
                    if (!parse_error && digit_count != 0) begin
                        dx <= parsed_dx;
                        if (number_negative)
                            dy <= -$signed({1'b0, number_value});
                        else
                            dy <= $signed({1'b0, number_value});
                        line_error <= 0;
                    end else begin
                        line_error <= 1;
                    end
                end
            end else if (rx_valid) begin
                if (rx_data == 8'h0A) begin
                    effective_len_tmp = line_len;
                    if (effective_len_tmp > 0 &&
                        line_mem[effective_len_tmp - 1] == 8'h0D)
                        effective_len_tmp = effective_len_tmp - 1;

                    line_len <= 0;
                    overflow <= 0;
                    effective_len <= effective_len_tmp[6:0];
                    line_error <= 1;
                    is_color <= 0;
                    is_status <= 0;
                    is_calibration <= 0; is_reset<=0; is_capability<=0; is_ping<=0;

                    if (!overflow && effective_len_tmp == 5 && line_mem[0]=="R" && line_mem[1]=="E" && line_mem[2]=="S" && line_mem[3]=="E" && line_mem[4]=="T") begin
                        is_reset<=1;line_error<=0;line_valid<=1;
                    end else if (!overflow && effective_len_tmp == 4 && line_mem[0]=="C" && line_mem[1]=="A" && line_mem[2]=="P" && line_mem[3]=="?") begin
                        is_capability<=1;line_error<=0;line_valid<=1;
                    end else if (!overflow && effective_len_tmp == 9 && line_mem[0]=="P" && line_mem[1]=="I" && line_mem[2]=="N" && line_mem[3]=="G" && line_mem[4]==" " &&
                      hex_digit(line_mem[5])<16 && hex_digit(line_mem[6])<16 && hex_digit(line_mem[7])<16 && hex_digit(line_mem[8])<16) begin
                        probe_id <= (hex_digit(line_mem[5])<<12)|(hex_digit(line_mem[6])<<8)|(hex_digit(line_mem[7])<<4)|hex_digit(line_mem[8]);
                        is_ping<=1;line_error<=0;line_valid<=1;
                    end else if (!overflow && effective_len_tmp == 7 &&
                        line_mem[0] == "S" && line_mem[1] == "T" &&
                        line_mem[2] == "A" && line_mem[3] == "T" &&
                        line_mem[4] == "U" && line_mem[5] == "S" &&
                        line_mem[6] == "?") begin
                        is_status <= 1;
                        line_error <= 0;
                        line_valid <= 1;
                    end else if (!overflow && effective_len_tmp == 6 &&
                        line_mem[0] == "C" && line_mem[1] == "A" &&
                        line_mem[2] == "L" && line_mem[3] == " " &&
                        line_mem[4] == "X" && line_mem[5] == "2") begin
                        is_calibration <= 1;
                        line_error <= 0;
                        line_valid <= 1;
                    end else if (!overflow && effective_len_tmp >= 10 &&
                                 line_mem[0] == "C" &&
                                 line_mem[1] == "O" &&
                                 line_mem[2] == "L" &&
                                 line_mem[3] == "O" &&
                                 line_mem[4] == "R" &&
                                 line_mem[5] == " ") begin
                        cursor_tmp = 0;
                        selected_color = 0;
                        if (line_mem[6]=="l" && line_mem[7]=="a" && line_mem[8]=="y" && line_mem[9]=="e" && line_mem[10]=="r") begin
                            selected_color=5;cursor_tmp=12;
                        end else if (line_mem[6] == "b" && line_mem[7] == "l" &&
                            line_mem[8] == "a" && line_mem[9] == "c" &&
                            line_mem[10] == "k") begin
                            selected_color = 1;
                            cursor_tmp = 12;
                        end else if (line_mem[6] == "r" && line_mem[7] == "e" &&
                            line_mem[8] == "d") begin
                            selected_color = 2;
                            cursor_tmp = 10;
                        end else if (line_mem[6] == "y" &&
                                     line_mem[7] == "e" &&
                                     line_mem[8] == "l" &&
                                     line_mem[9] == "l" &&
                                     line_mem[10] == "o" &&
                                     line_mem[11] == "w") begin
                            selected_color = 3;
                            cursor_tmp = 13;
                        end else if (line_mem[6] == "b" &&
                                     line_mem[7] == "l" &&
                                     line_mem[8] == "u" &&
                                     line_mem[9] == "e") begin
                            selected_color = 4;
                            cursor_tmp = 11;
                        end

                        if (cursor_tmp != 0 &&
                            effective_len_tmp > cursor_tmp &&
                            line_mem[cursor_tmp - 1] == " ") begin
                            is_color <= 1;
                            color <= selected_color;
                            parse_state <= PARSE_COLOR_COUNT;
                            parse_cursor <= cursor_tmp;
                            count_value <= 0;
                            digit_count <= 0;
                            parse_error <= 0;
                        end else begin
                            line_valid <= 1;
                        end
                    end else if (!overflow && effective_len_tmp >= 5 &&
                                 (line_mem[0] == "J" ||
                                  line_mem[0] == "S") &&
                                 line_mem[1] == ",") begin
                        action_stitch <= (line_mem[0] == "S");
                        parse_state <= PARSE_ACTION_X;
                        parse_cursor <= 2;
                        number_value <= 0;
                        digit_count <= 0;
                        number_negative <= 0;
                        sign_allowed <= 1;
                        parse_error <= 0;
                    end else begin
                        line_valid <= 1;
                    end
                end else if (line_len < LINE_MAX) begin
                    line_mem[line_len] <= rx_data;
                    line_len <= line_len + 1'b1;
                end else begin
                    overflow <= 1;
                end
            end
        end
    end

endmodule
