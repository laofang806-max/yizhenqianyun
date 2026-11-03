// 双触发器同步并以连续稳定采样消抖，active 输出统一为高有效。
module input_filter #(
    parameter CLK_HZ = 50_000_000,
    parameter DEBOUNCE_MS = 10,
    parameter ACTIVE_LOW = 0
) (
    input clk,
    input rst_n,
    input async_in,
    output reg active
);
    localparam integer LIMIT = (CLK_HZ / 1000) * DEBOUNCE_MS;
    localparam integer CW = (LIMIT < 2) ? 1 : $clog2(LIMIT + 1);
    reg sync1, sync2;
    reg [CW-1:0] count;
    wire sample = ACTIVE_LOW ? !sync2 : sync2;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            sync1 <= ACTIVE_LOW;
            sync2 <= ACTIVE_LOW;
            active <= 1'b0;
            count <= 0;
        end else begin
            sync1 <= async_in;
            sync2 <= sync1;
            if (sample == active) begin
                count <= 0;
            end else if (LIMIT <= 1 || count >= LIMIT - 1) begin
                active <= sample;
                count <= 0;
            end else begin
                count <= count + 1'b1;
            end
        end
    end
endmodule
