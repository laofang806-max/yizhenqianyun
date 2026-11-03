// UART 8N1 收发
module uart_rx #(
    parameter CLK_HZ = 50_000_000,
    parameter BAUD   = 115200
)(
    input            clk,
    input            rst_n,
    input            rxd,
    output reg [7:0] data,
    output reg       valid
);
    localparam DIV = CLK_HZ / BAUD;

    reg [1:0]  sync;
    reg        busy;
    reg [15:0] cnt;
    reg [3:0]  bit_idx;
    reg [7:0]  shift;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            sync <= 2'b11; busy <= 0; cnt <= 0; bit_idx <= 0;
            shift <= 0; data <= 0; valid <= 0;
        end else begin
            sync  <= {sync[0], rxd};
            valid <= 1'b0;
            if (!busy) begin
                if (sync[1] == 1'b0) begin
                    busy <= 1; bit_idx <= 0;
                    cnt <= DIV + DIV/2 - 1; // 跳过起始位，对准第 0 位中点
                end
            end else if (cnt != 0) begin
                cnt <= cnt - 1'b1;
            end else begin
                cnt <= DIV - 1;
                if (bit_idx < 8) begin
                    shift   <= {sync[1], shift[7:1]};
                    bit_idx <= bit_idx + 1'b1;
                end else begin
                    busy <= 0;
                    if (sync[1]) begin // 停止位必须为 1
                        data  <= shift;
                        valid <= 1'b1;
                    end
                end
            end
        end
    end
endmodule

module uart_tx #(
    parameter CLK_HZ = 50_000_000,
    parameter BAUD   = 115200
)(
    input            clk,
    input            rst_n,
    input  [7:0]     data,
    input            start,
    output reg       txd,
    output           busy
);
    localparam DIV = CLK_HZ / BAUD;

    reg [9:0]  frame;
    reg [3:0]  bit_idx;
    reg [15:0] cnt;
    reg        active;

    assign busy = active;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            txd <= 1; active <= 0; cnt <= 0; bit_idx <= 0; frame <= 10'h3FF;
        end else if (!active) begin
            if (start) begin
                frame   <= {1'b1, data, 1'b0};
                active  <= 1; bit_idx <= 0; cnt <= DIV - 1;
                txd     <= 1'b0;
            end
        end else if (cnt != 0) begin
            cnt <= cnt - 1'b1;
        end else begin
            cnt <= DIV - 1;
            if (bit_idx == 9) begin
                active <= 0; txd <= 1;
            end else begin
                bit_idx <= bit_idx + 1'b1;
                txd     <= frame[bit_idx + 1];
            end
        end
    end
endmodule
