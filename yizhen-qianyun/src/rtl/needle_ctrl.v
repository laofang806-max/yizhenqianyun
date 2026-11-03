// One stitch: bounded short pulses and verified down/up feedback.
// sensor_down is synchronized/filtered externally: 1=blocked, 0=clear/up.
module needle_ctrl #(
    parameter CLK_HZ=50_000_000,
    parameter WAIT_DELAY1_MS=250, PULSE_MS=20, WAIT_DELAY2_MS=20,
    parameter FEEDBACK_ENABLE=1,
    parameter RETRY_WAIT_MS=200, MAX_PULSES=3,
    parameter DOWN_TIMEOUT_MS=1000, RETURN_TIMEOUT_MS=2000
)(
    input clk, rst_n, start, pause, cancel, sensor_down,
    output reg busy, done, needle_trig,
    output reg [1:0] phase,
    output reg fault,
    output reg [2:0] fault_code
);
    localparam N_IDLE=0,N_DELAY1=1,N_PULSE=2,N_DELAY2=3;
    localparam D1=(CLK_HZ/1000)*WAIT_DELAY1_MS;
    localparam P=(CLK_HZ/1000)*PULSE_MS;
    localparam D2=(CLK_HZ/1000)*WAIT_DELAY2_MS;
    localparam RETRY=(CLK_HZ/1000)*RETRY_WAIT_MS;
    localparam DOWN=(CLK_HZ/1000)*DOWN_TIMEOUT_MS;
    localparam UP=(CLK_HZ/1000)*RETURN_TIMEOUT_MS;
    reg [31:0] timer, elapsed, gap_count, pulse_count;
    reg seen_down, seen_return;
    task fail;
      input [2:0] code;
      begin
        fault<=1;fault_code<=code;needle_trig<=0;busy<=0;done<=0;phase<=N_IDLE;
      end
    endtask
    always @(posedge clk or negedge rst_n) begin
      if(!rst_n)begin
        busy<=0;done<=0;needle_trig<=0;phase<=N_IDLE;
        fault<=0;fault_code<=0;timer<=0;elapsed<=0;gap_count<=0;
        pulse_count<=0;seen_down<=0;seen_return<=0;
      end else begin
        done<=0;
        if(fault)begin needle_trig<=0;busy<=0;end
        else if(cancel)begin
          needle_trig<=0;busy<=0;phase<=N_IDLE;
        end else if(pause && busy && FEEDBACK_ENABLE)begin
          // Do not silently restart an interrupted mechanical cycle.
          fail(4);
        end else if(pause)needle_trig<=0;
        else begin
          if(FEEDBACK_ENABLE && (phase==N_PULSE || phase==N_DELAY2))begin
            elapsed<=elapsed+1'b1;
            if(sensor_down)begin seen_down<=1;seen_return<=0;end
            else if(seen_down)seen_return<=1;
          end
          case(phase)
            N_IDLE:begin
              needle_trig<=0;
              if(start)begin
                if(FEEDBACK_ENABLE && sensor_down)fail(1);
                else begin
                  busy<=1;timer<=D1;phase<=N_DELAY1;elapsed<=0;
                  seen_down<=0;seen_return<=0;pulse_count<=0;gap_count<=0;
                end
              end
            end
            N_DELAY1:begin
              if(FEEDBACK_ENABLE && sensor_down)fail(1);
              else if(timer>1)timer<=timer-1'b1;
              else begin timer<=P;needle_trig<=1;pulse_count<=1;phase<=N_PULSE;end
            end
            N_PULSE:begin
              if(FEEDBACK_ENABLE && seen_return && !sensor_down)begin
                needle_trig<=0;timer<=D2;phase<=N_DELAY2;gap_count<=0;
              end else if(timer>1)timer<=timer-1'b1;
              else begin needle_trig<=0;timer<=D2;phase<=N_DELAY2;gap_count<=0;end
            end
            N_DELAY2:begin
              needle_trig<=0;
              if(!FEEDBACK_ENABLE || (seen_return && !sensor_down))begin
                if(timer>1)timer<=timer-1'b1;
                else begin busy<=0;done<=1;phase<=N_IDLE;end
              end else begin
                // Settle time starts only after a verified return.
                timer<=D2;
                if(gap_count<RETRY)gap_count<=gap_count+1'b1;
                else if(seen_down && sensor_down)begin
                  if(pulse_count<MAX_PULSES)begin
                    needle_trig<=1;timer<=P;pulse_count<=pulse_count+1'b1;phase<=N_PULSE;
                  end else fail(3);
                end
              end
            end
          endcase
          // Whole-cycle deadlines keep missing/stuck inputs from hanging forever.
          if(FEEDBACK_ENABLE && (phase==N_PULSE || phase==N_DELAY2))begin
            if(!seen_down && elapsed>=DOWN-1)fail(2);
            else if(!(seen_return && !sensor_down) && elapsed>=UP-1)fail(3);
          end
        end
      end
    end
endmodule
