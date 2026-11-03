// x4 正交编码器解码，并以 Q16.16 计数/步比例比较电机脉冲与反馈。
module encoder_monitor #(
    parameter COUNTS_PER_STEP_Q16 = 32'd65536,
    parameter STALL_THRESHOLD = 100,
    parameter INVERT_X = 0,
    parameter INVERT_Y = 0
) (
    input clk,
    input rst_n,
    input clear,
    input enable,
    input step_x,
    input step_y,
    input dir_x_positive,
    input dir_y_positive,
    input enc_x_a,
    input enc_x_b,
    input enc_y_a,
    input enc_y_b,
    output reg stall,
    output reg signed [31:0] count_x,
    output reg signed [31:0] count_y
);
    (* ASYNC_REG = "TRUE" *) reg [1:0] x_meta, y_meta, x_sync, y_sync;
    reg [1:0] x_prev, y_prev;
    reg [2:0] primed;
    reg signed [63:0] expected_x_q16, expected_y_q16;
    wire signed [63:0] x_measured_q16 = {{32{count_x[31]}}, count_x} <<< 16;
    wire signed [63:0] y_measured_q16 = {{32{count_y[31]}}, count_y} <<< 16;
    wire signed [63:0] x_error = expected_x_q16 - x_measured_q16;
    wire signed [63:0] y_error = expected_y_q16 - y_measured_q16;
    wire [63:0] x_abs_error = x_error[63] ? -x_error : x_error;
    wire [63:0] y_abs_error = y_error[63] ? -y_error : y_error;
    localparam [63:0] LIMIT_Q16 = STALL_THRESHOLD * 65536;
    localparam signed [63:0] COUNTS_STEP_Q16 = COUNTS_PER_STEP_Q16;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            x_meta <= 0; y_meta <= 0; x_sync <= 0; y_sync <= 0;
            x_prev <= 0; y_prev <= 0; primed <= 0;
            count_x <= 0; count_y <= 0; expected_x_q16 <= 0;
            expected_y_q16 <= 0; stall <= 0;
        end else begin
            x_meta <= {enc_x_a, enc_x_b}; y_meta <= {enc_y_a, enc_y_b};
            x_sync <= x_meta; y_sync <= y_meta;
            if (!primed[2]) primed <= primed + 1'b1;
            x_prev <= x_sync;
            y_prev <= y_sync;
            if (clear) begin
                count_x <= 0; count_y <= 0;
                expected_x_q16 <= 0; expected_y_q16 <= 0;
                stall <= 1'b0;
                x_prev <= x_sync;
                y_prev <= y_sync;
            end else if (enable && primed[2]) begin
                case ({x_prev, x_sync})
                    4'b0001, 4'b0111, 4'b1110, 4'b1000:
                        count_x <= count_x + (INVERT_X ? -1 : 1);
                    4'b0010, 4'b1011, 4'b1101, 4'b0100:
                        count_x <= count_x - (INVERT_X ? -1 : 1);
                    default: count_x <= count_x;
                endcase
                case ({y_prev, y_sync})
                    4'b0001, 4'b0111, 4'b1110, 4'b1000:
                        count_y <= count_y + (INVERT_Y ? -1 : 1);
                    4'b0010, 4'b1011, 4'b1101, 4'b0100:
                        count_y <= count_y - (INVERT_Y ? -1 : 1);
                    default: count_y <= count_y;
                endcase
                if (step_x)
                    expected_x_q16 <= expected_x_q16 +
                        (dir_x_positive ? COUNTS_STEP_Q16 : -COUNTS_STEP_Q16);
                if (step_y)
                    expected_y_q16 <= expected_y_q16 +
                        (dir_y_positive ? COUNTS_STEP_Q16 : -COUNTS_STEP_Q16);
                if (x_abs_error > LIMIT_Q16 || y_abs_error > LIMIT_Q16)
                    stall <= 1'b1;
            end
        end
    end
endmodule
