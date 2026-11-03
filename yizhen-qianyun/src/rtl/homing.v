// 双轴独立低速回零，限位输入须由外层同步消抖。
module homing #(
    parameter CLK_HZ = 50_000_000,
    parameter STEP_HZ = 500,
    parameter PULSE_US = 5,
    parameter HOME_DIR_X = 0,
    parameter HOME_DIR_Y = 0,
    parameter DIR_X_INVERT = 0,
    parameter DIR_Y_INVERT = 0
) (
    input clk,
    input rst_n,
    input start,
    input pause,
    input limit_x,
    input limit_y,
    output reg busy,
    output reg done,
    output reg step_x,
    output reg dir_x,
    output reg step_y,
    output reg dir_y
);
    localparam integer PERIOD = CLK_HZ / STEP_HZ;
    localparam integer PULSE = (CLK_HZ / 1_000_000) * PULSE_US;
    reg [31:0] timer_x, timer_y;
    reg [31:0] high_x, high_y;
    reg hit_x, hit_y;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            busy <= 0; done <= 0; step_x <= 0; step_y <= 0;
            dir_x <= HOME_DIR_X ^ DIR_X_INVERT;
            dir_y <= HOME_DIR_Y ^ DIR_Y_INVERT;
            timer_x <= 0; timer_y <= 0; high_x <= 0; high_y <= 0;
            hit_x <= 0; hit_y <= 0;
        end else if (start && !busy) begin
            busy <= 1'b1;
            done <= 1'b0;
            hit_x <= limit_x;
            hit_y <= limit_y;
            timer_x <= 0; timer_y <= 0; high_x <= 0; high_y <= 0;
            step_x <= 0; step_y <= 0;
        end else if (pause) begin
            step_x <= 0;
            step_y <= 0;
        end else if (busy) begin
            if (limit_x) begin
                hit_x <= 1'b1;
                step_x <= 0;
                timer_x <= 0;
                high_x <= 0;
            end else if (!hit_x) begin
                if (high_x != 0) begin
                    high_x <= high_x - 1'b1;
                    if (high_x == 1) step_x <= 0;
                end else if (timer_x >= PERIOD - 1) begin
                    timer_x <= 0;
                    step_x <= 1'b1;
                    high_x <= (PULSE > 0) ? PULSE : 1;
                end else begin
                    timer_x <= timer_x + 1'b1;
                end
            end
            if (limit_y) begin
                hit_y <= 1'b1;
                step_y <= 0;
                timer_y <= 0;
                high_y <= 0;
            end else if (!hit_y) begin
                if (high_y != 0) begin
                    high_y <= high_y - 1'b1;
                    if (high_y == 1) step_y <= 0;
                end else if (timer_y >= PERIOD - 1) begin
                    timer_y <= 0;
                    step_y <= 1'b1;
                    high_y <= (PULSE > 0) ? PULSE : 1;
                end else begin
                    timer_y <= timer_y + 1'b1;
                end
            end
            if ((hit_x || limit_x) && (hit_y || limit_y)) begin
                busy <= 1'b0;
                done <= 1'b1;
                step_x <= 1'b0;
                step_y <= 1'b0;
            end
        end
    end
endmodule
