// 双轴 DDA 直线插补；线性速度周期曲线实现有限加/减速梯形。
module motion_xy #(
    parameter CLK_HZ = 50_000_000,
    parameter STEP_MAX_HZ = 4000,
    parameter STEP_START_HZ = 400,
    parameter ACCEL_TIME_MS = 250,
    parameter PULSE_US = 5,
    parameter DIR_X_INVERT = 0,
    parameter DIR_Y_INVERT = 0
) (
    input clk,
    input rst_n,
    input start,
    input pause,
    input cancel,
    input signed [31:0] dx,
    input signed [31:0] dy,
    output reg busy,
    output reg done,
    output reg step_x,
    output reg step_y,
    output reg step_event_x,
    output reg step_event_y,
    output reg dir_x,
    output reg dir_y
);
    localparam integer PERIOD_START = CLK_HZ / STEP_START_HZ;
    localparam integer PERIOD_FAST = CLK_HZ / STEP_MAX_HZ;
    localparam integer PULSE_CYCLES = (CLK_HZ / 1_000_000) * PULSE_US;
    localparam integer ACCEL_STEPS = (STEP_MAX_HZ * ACCEL_TIME_MS) / 1000;
    localparam integer RAMP_STEPS = (ACCEL_STEPS < 1) ? 1 : ACCEL_STEPS;
    localparam integer PERIOD_DELTA =
        (PERIOD_START > PERIOD_FAST)
            ? (PERIOD_START - PERIOD_FAST + RAMP_STEPS - 1) / RAMP_STEPS : 0;

    reg [31:0] major, minor, done_steps, accumulator;
    reg [31:0] timer, pulse_left, period_now;
    reg [31:0] ramp_index;
    reg major_x;
    reg [1:0] state;
    localparam M_IDLE = 2'd0, M_WAIT = 2'd1, M_PULSE = 2'd2;
    wire [63:0] ramp_product = ramp_index * PERIOD_DELTA;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            busy <= 0; done <= 0; step_x <= 0; step_y <= 0;
            step_event_x <= 0; step_event_y <= 0; dir_x <= 0; dir_y <= 0;
            major <= 0; minor <= 0;
            done_steps <= 0; accumulator <= 0; timer <= 0; pulse_left <= 0;
            period_now <= PERIOD_START; ramp_index <= 0; major_x <= 1;
            state <= M_IDLE;
        end else begin
            done <= 1'b0;
            step_event_x <= 1'b0;
            step_event_y <= 1'b0;
            if (cancel) begin
                state <= M_IDLE; busy <= 0; step_x <= 0; step_y <= 0;
                timer <= 0; pulse_left <= 0;
            end else if (pause) begin
                // The top-level E-stop already forced STEP low. Clear the stored high
                // level as well so resuming cannot create an uncommanded rising edge.
                step_x <= 0;
                step_y <= 0;
            end else begin
                case (state)
                    M_IDLE: begin
                        step_x <= 0; step_y <= 0;
                        if (start) begin
                            dir_x <= dx[31] ^ DIR_X_INVERT;
                            dir_y <= dy[31] ^ DIR_Y_INVERT;
                            busy <= 1'b1;
                            done_steps <= 0;
                            accumulator <= 0;
                            timer <= 0;
                            period_now <= PERIOD_START;
                            ramp_index <= 0;
                            major_x <= (dx[31] ? -dx : dx) >= (dy[31] ? -dy : dy);
                            major <= ((dx[31] ? -dx : dx) >= (dy[31] ? -dy : dy))
                                ? (dx[31] ? -dx : dx) : (dy[31] ? -dy : dy);
                            minor <= ((dx[31] ? -dx : dx) >= (dy[31] ? -dy : dy))
                                ? (dy[31] ? -dy : dy) : (dx[31] ? -dx : dx);
                            state <= M_WAIT;
                        end
                    end
                    M_WAIT: begin
                        if (major == 0) begin
                            busy <= 0; done <= 1'b1; state <= M_IDLE;
                        end else if (timer >= period_now - 1) begin
                            timer <= 0;
                            step_x <= major_x;
                            step_y <= !major_x;
                            step_event_x <= major_x;
                            step_event_y <= !major_x;
                            if (major != 0) begin
                                if (accumulator + minor >= major) begin
                                    accumulator <= accumulator + minor - major;
                                    if (major_x) begin step_y <= 1'b1; step_event_y <= 1'b1; end
                                    else begin step_x <= 1'b1; step_event_x <= 1'b1; end
                                end else begin
                                    accumulator <= accumulator + minor;
                                end
                            end
                            pulse_left <= (PULSE_CYCLES > 0) ? PULSE_CYCLES : 1;
                            if (done_steps + 1 >= major) begin
                                busy <= 1'b1;
                                done_steps <= done_steps + 1'b1;
                                ramp_index <= 0;
                            end else begin
                                done_steps <= done_steps + 1'b1;
                                ramp_index <= (done_steps + 1'b1 < major - done_steps - 2)
                                    ? done_steps + 1'b1 : major - done_steps - 2;
                            end
                            state <= M_PULSE;
                        end else begin
                            timer <= timer + 1'b1;
                        end
                    end
                    M_PULSE: begin
                        if (pulse_left > 0) begin
                            pulse_left <= pulse_left - 1'b1;
                            if (pulse_left == 1) begin
                                step_x <= 0;
                                step_y <= 0;
                            end
                        end else begin
                            if (done_steps >= major) begin
                                busy <= 0; done <= 1'b1; state <= M_IDLE;
                            end else begin
                                if (ramp_product >= PERIOD_START - PERIOD_FAST)
                                    period_now <= PERIOD_FAST;
                                else
                                    period_now <= PERIOD_START - ramp_product[31:0];
                                timer <= 0;
                                state <= M_WAIT;
                            end
                        end
                    end
                    default: state <= M_IDLE;
                endcase
            end
        end
    end
endmodule

// Segment-end encoder feedback servo. Nominal STEP events update logical task
// coordinates; correction STEP pulses move hardware only, never shift the target.
module motion_feedback #(
 parameter CLK_HZ=50_000_000, STEP_MAX_HZ=8000, STEP_START_HZ=200,
 parameter ACCEL_TIME_MS=25, PULSE_US=5, DIR_X_INVERT=0, DIR_Y_INVERT=0,
 parameter ENABLE=0, COUNTS_PER_STEP_Q16=32'd20480,
 parameter TOLERANCE_COUNTS=10, SETTLE_MS=80, STABLE_MS=50,
 parameter CORRECTION_HZ=400, MAX_CORRECTION_STEPS=800,
 parameter MAX_ERROR_COUNTS=1000, MAX_ATTEMPTS=8, TIMEOUT_MS=12000
)(
 input clk,rst_n,start,pause,cancel,clear,
 input signed [31:0] dx,dy,encoder_x,encoder_y,
 output wire busy,done,step_x,step_y,step_event_x,step_event_y,dir_x,dir_y,
 output wire fault,correcting
);
 wire fast_busy,fast_done,fast_x,fast_y,fast_event_x,fast_event_y,fast_dir_x,fast_dir_y;
 wire slow_busy,slow_done,slow_x,slow_y,slow_dir_x,slow_dir_y;
 reg fast_start,slow_start;
 reg signed [31:0] fast_dx,fast_dy,slow_dx,slow_dy;
 reg [2:0] state;
 localparam IDLE=0,FAST=1,SETTLE=2,CHECK=3,STABLE=4,SLOW=5,ERROR=6;
 reg origin_valid;
 reg signed [31:0] origin_x,origin_y;
 reg signed [63:0] target_x_q16,target_y_q16;
 wire signed [31:0] relative_x=encoder_x-origin_x,relative_y=encoder_y-origin_y;
 reg signed [63:0] error_x,error_y;
 // Register encoder-to-target subtraction separately from error checks and
 // count-to-step conversion. All stages settle long before the 80ms check.
 always @(posedge clk or negedge rst_n)begin
  if(!rst_n)begin error_x<=0;error_y<=0;end
  else begin
   error_x<=target_x_q16-({{32{relative_x[31]}},relative_x}<<<16);
   error_y<=target_y_q16-({{32{relative_y[31]}},relative_y}<<<16);
  end
 end
 wire [63:0] abs_x=error_x[63]?-error_x:error_x,abs_y=error_y[63]?-error_y:error_y;
 localparam signed [63:0] RATIO=COUNTS_PER_STEP_Q16;
 localparam [63:0] TOL_Q16=TOLERANCE_COUNTS*64'd65536;
 localparam [63:0] MAX_Q16=MAX_ERROR_COUNTS*64'd65536;
 wire in_position=(abs_x<=TOL_Q16)&&(abs_y<=TOL_Q16);
 reg signed [15:0] correction_counts_x,correction_counts_y;
 reg signed [31:0] correction_x,correction_y;
 // The CHECK state rejects errors above 1000 counts before these values
 // can be used. A 16-bit count domain is sufficient; residual sub-count
 // rounding is covered by the 10-count arrival tolerance and rechecked.
 always @(posedge clk or negedge rst_n)begin
  if(!rst_n)begin correction_counts_x<=0;correction_counts_y<=0;correction_x<=0;correction_y<=0;end
  else begin
   correction_counts_x<=error_x[31:16];correction_counts_y<=error_y[31:16];
   correction_x<=$signed({correction_counts_x,16'b0})/$signed(COUNTS_PER_STEP_Q16);
   correction_y<=$signed({correction_counts_y,16'b0})/$signed(COUNTS_PER_STEP_Q16);
  end
 end
 reg [31:0] timer,attempts;
 reg [63:0] elapsed,previous_error;
 reg check_progress,done_reg;
 localparam [63:0] TIMEOUT_CYCLES=(CLK_HZ/1000)*TIMEOUT_MS;
 localparam [31:0] SETTLE_CYCLES=(CLK_HZ/1000)*SETTLE_MS;
 localparam [31:0] STABLE_CYCLES=(CLK_HZ/1000)*STABLE_MS;
 function signed [31:0] limited;
  input signed [63:0] value;
  begin
   if(value>MAX_CORRECTION_STEPS)limited=MAX_CORRECTION_STEPS;
   else if(value < -MAX_CORRECTION_STEPS)limited=-MAX_CORRECTION_STEPS;
   else limited=value[31:0];
  end
 endfunction
 wire slow_selected=ENABLE&&(state==SLOW);
 assign correcting=slow_selected;
 assign fault=ENABLE&&(state==ERROR);
 assign busy=ENABLE?((state!=IDLE)&&(state!=ERROR)):fast_busy;
 assign done=ENABLE?done_reg:fast_done;
 assign step_x=slow_selected?slow_x:fast_x;
 assign step_y=slow_selected?slow_y:fast_y;
 assign dir_x=slow_selected?slow_dir_x:fast_dir_x;
 assign dir_y=slow_selected?slow_dir_y:fast_dir_y;
 assign step_event_x=fast_event_x;
 assign step_event_y=fast_event_y;
 motion_xy #(.CLK_HZ(CLK_HZ),.STEP_MAX_HZ(STEP_MAX_HZ),.STEP_START_HZ(STEP_START_HZ),
  .ACCEL_TIME_MS(ACCEL_TIME_MS),.PULSE_US(PULSE_US),.DIR_X_INVERT(DIR_X_INVERT),.DIR_Y_INVERT(DIR_Y_INVERT)) fast_engine(
  .clk(clk),.rst_n(rst_n),.start(ENABLE?fast_start:start),.pause(pause),.cancel(cancel||clear),
  .dx(ENABLE?fast_dx:dx),.dy(ENABLE?fast_dy:dy),.busy(fast_busy),.done(fast_done),
  .step_x(fast_x),.step_y(fast_y),.step_event_x(fast_event_x),.step_event_y(fast_event_y),.dir_x(fast_dir_x),.dir_y(fast_dir_y));
 motion_xy #(.CLK_HZ(CLK_HZ),.STEP_MAX_HZ(CORRECTION_HZ),.STEP_START_HZ(CORRECTION_HZ),
  .ACCEL_TIME_MS(1),.PULSE_US(PULSE_US),.DIR_X_INVERT(DIR_X_INVERT),.DIR_Y_INVERT(DIR_Y_INVERT)) slow_engine(
  .clk(clk),.rst_n(rst_n),.start(slow_start),.pause(pause),.cancel(cancel||clear),
  .dx(slow_dx),.dy(slow_dy),.busy(slow_busy),.done(slow_done),
  .step_x(slow_x),.step_y(slow_y),.step_event_x(),.step_event_y(),.dir_x(slow_dir_x),.dir_y(slow_dir_y));
 always @(posedge clk or negedge rst_n)begin
  if(!rst_n)begin
   state<=IDLE;origin_valid<=0;origin_x<=0;origin_y<=0;target_x_q16<=0;target_y_q16<=0;
   fast_start<=0;slow_start<=0;fast_dx<=0;fast_dy<=0;slow_dx<=0;slow_dy<=0;
   timer<=0;elapsed<=0;attempts<=0;check_progress<=0;previous_error<=0;done_reg<=0;
  end else begin
   done_reg<=0;
   fast_start<=fast_start&&pause;slow_start<=slow_start&&pause;
   if(clear)begin
    state<=IDLE;origin_valid<=0;target_x_q16<=0;target_y_q16<=0;
    fast_start<=0;slow_start<=0;elapsed<=0;timer<=0;attempts<=0;check_progress<=0;
   end else if(cancel)begin
    if(state!=ERROR)state<=IDLE;
    fast_start<=0;slow_start<=0;
   end else if(ENABLE&&!pause)begin
    if(state!=IDLE&&state!=ERROR&&state!=FAST)elapsed<=elapsed+1;
    if(state!=IDLE&&state!=ERROR&&state!=FAST&&elapsed>=TIMEOUT_CYCLES)state<=ERROR;
    else case(state)
     IDLE:if(start)begin
      if(!origin_valid)begin origin_x<=encoder_x;origin_y<=encoder_y;origin_valid<=1;end
      target_x_q16<=target_x_q16+$signed(dx)*RATIO;
      target_y_q16<=target_y_q16+$signed(dy)*RATIO;
      fast_dx<=dx;fast_dy<=dy;fast_start<=1;state<=FAST;
      elapsed<=0;attempts<=0;timer<=0;check_progress<=0;
     end
     FAST:if(fast_done)begin state<=SETTLE;timer<=0;elapsed<=0;end
     SETTLE:if(timer>=SETTLE_CYCLES)begin state<=CHECK;timer<=0;end else timer<=timer+1;
     CHECK:begin
      if(in_position)begin state<=STABLE;timer<=0;end
      else if(abs_x>MAX_Q16||abs_y>MAX_Q16||attempts>=MAX_ATTEMPTS||
              (check_progress&&(abs_x+abs_y>=previous_error)))state<=ERROR;
      else begin
       slow_dx<=limited(correction_x);slow_dy<=limited(correction_y);
       slow_start<=1;state<=SLOW;attempts<=attempts+1;
       previous_error<=abs_x+abs_y;check_progress<=1;
      end
     end
     STABLE:if(!in_position)begin state<=CHECK;timer<=0;end
       else if(timer>=STABLE_CYCLES)begin done_reg<=1;state<=IDLE;end else timer<=timer+1;
     SLOW:if(slow_done)begin state<=SETTLE;timer<=0;end
     ERROR:state<=ERROR;
     default:state<=ERROR;
    endcase
   end
  end
 end
endmodule
