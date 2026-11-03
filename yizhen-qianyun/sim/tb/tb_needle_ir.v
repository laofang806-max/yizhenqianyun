`timescale 1ns/1ps
module tb_needle_ir;
 reg clk=0,rst=0,start=0,pause=0,cancel=0,sensor=0;
 wire busy,done,trig,fault;wire[1:0]phase;wire[2:0]code;
 integer edges=0,completions=0;
 always #5 clk=~clk;
 needle_ctrl #(.CLK_HZ(1000),.WAIT_DELAY1_MS(2),.PULSE_MS(3),.WAIT_DELAY2_MS(2),
 .RETRY_WAIT_MS(4),.MAX_PULSES(3),.DOWN_TIMEOUT_MS(20),.RETURN_TIMEOUT_MS(40)) dut(
 .clk(clk),.rst_n(rst),.start(start),.pause(pause),.cancel(cancel),.sensor_down(sensor),
 .busy(busy),.done(done),.needle_trig(trig),.phase(phase),.fault(fault),.fault_code(code));
 always @(posedge trig)edges=edges+1;
 always @(posedge clk)if(done)completions=completions+1;
 task ticks(input integer n);repeat(n)@(negedge clk);endtask
 task reset;begin rst=0;start=0;pause=0;cancel=0;sensor=0;ticks(3);rst=1;ticks(2);edges=0;completions=0;end endtask
 task launch;begin start=1;ticks(1);start=0;end endtask
 initial begin
   reset;launch;wait(trig);@(negedge clk);sensor=1;ticks(2);sensor=0;
   wait(done);ticks(2);if(fault||edges!=1||completions!=1)$fatal(1,"normal cycle");
   reset;launch;wait(trig);@(negedge clk);sensor=1;
   wait(edges==2);@(negedge clk);sensor=0;wait(done);ticks(2);
   if(fault||edges!=2||completions!=1)$fatal(1,"bounded retry then return");
   reset;launch;wait(fault);ticks(1);
   if(code!=2||edges!=1||done||trig||completions)$fatal(1,"no down must fault without blind retry");
   reset;launch;wait(trig);@(negedge clk);sensor=1;wait(fault);ticks(1);
   if(code!=3||edges!=3||done||trig||completions)$fatal(1,"stuck down retry limit");
   start=1;sensor=0;ticks(10);if(!fault||trig||busy)$fatal(1,"fault must latch");
   reset;sensor=1;launch;ticks(2);if(!fault||code!=1||edges)$fatal(1,"initial blocked");
   reset;launch;wait(trig);@(negedge clk);pause=1;ticks(1);
   if(!fault||code!=4||trig)$fatal(1,"pause output");pause=0;ticks(10);if(trig)$fatal(1,"pause replay");
   reset;launch;wait(trig);@(negedge clk);sensor=1;ticks(1);cancel=1;ticks(2);
   if(busy||done||trig)$fatal(1,"external fault cancel");
   $display("PASS: needle IR cycle, retry, missing down, stuck return, initial blocked, pause, cancel");$finish;
 end
 initial begin #20000;$fatal(1,"watchdog");end
endmodule

module tb_needle_ir_top;
 reg clk=0,rst=0,rxd=1,start=1,sensor=0;
 reg respond=1,return_ok=1;
 wire xs,ys,needle,txd;wire[3:0]led;
 wire[7:0]reply_byte;wire reply_valid;
 string reply_line="";integer busy_replies=0;
 uart_rx #(.CLK_HZ(1_000_000),.BAUD(100_000)) check_rx(
 .clk(clk),.rst_n(rst),.rxd(txd),.data(reply_byte),.valid(reply_valid));
 always @(posedge clk)begin
   if(!rst)reply_line="";
   else if(reply_valid)begin
     if(reply_byte==10)begin
       if(reply_line=="ERR needle")$fatal(1,"Forbidden needle error response");
       if(reply_line=="BUSY")busy_replies=busy_replies+1;
       reply_line="";
     end else reply_line={reply_line,reply_byte};
   end
 end
 integer nx=0,ny=0,pulses=0,nexts=0;
 always #500 clk=~clk;
 top #(.CLK_HZ(1_000_000),.BAUD(100_000),.STEP_START_HZ(1000),.STEP_MAX_HZ(1000),
 .BUTTON_DEBOUNCE_MS(1),.WAIT_DELAY1_MS(1),.NEEDLE_PULSE_MS(1),.WAIT_DELAY2_MS(1),
 .NEEDLE_FEEDBACK_ENABLE(1),.NEEDLE_SENSOR_DEBOUNCE_MS(0),
 .NEEDLE_RETRY_WAIT_MS(2),.NEEDLE_MAX_PULSES(2),.NEEDLE_DOWN_TIMEOUT_MS(10),.NEEDLE_RETURN_TIMEOUT_MS(20)) dut(
 .sys_clk(clk),.sys_rst_n(rst),.uart_rxd(rxd),.uart_txd(txd),.start_button(start),
 .estop_button(1'b1),.limit_x(1'b0),.limit_y(1'b0),
 .encoder_x_a(1'b1),.encoder_x_b(1'b1),.encoder_y_a(1'b1),.encoder_y_b(1'b1),
 .needle_sensor(sensor),.x_step(xs),.x_dir(),.y_step(ys),.y_dir(),
 .motor_en(),.needle_trig(needle),.needle_sensor_debug(),.led(led),.debug_state());
 always @(posedge xs)begin nx=nx+1;if(sensor)$fatal(1,"X moved with needle blocked");end
 always @(posedge ys)begin ny=ny+1;if(sensor)$fatal(1,"Y moved with needle blocked");end
 always @(posedge clk)if(dut.text_request && dut.text_message==2)nexts=nexts+1;
 always @(posedge needle)begin
   pulses=pulses+1;
   if(respond)begin
     #100000;sensor=1;
     if(return_ok)begin #1400000;sensor=0;end
   end
 end
 task byte_uart(input [7:0]v);integer i;begin
 rxd=0;#10000;for(i=0;i<8;i=i+1)begin rxd=v[i];#10000;end rxd=1;#10000;end endtask
 task text_uart(input [127:0]v,input integer n);integer i;begin
 for(i=0;i<n;i=i+1)byte_uart(v[8*(n-i-1)+:8]);end endtask
 task initialize;begin rst=0;start=1;sensor=0;repeat(6)@(negedge clk);rst=1;wait(dut.state==1);nx=0;ny=0;pulses=0;nexts=0;end endtask
 task run_task;begin
 text_uart("COLOR black 4\n",14);text_uart("J,3,0\n",6);text_uart("S,0,0\n",6);
 text_uart("J,0,2\n",6);text_uart("S,0,0\n",6);
 wait(dut.state==3);@(negedge clk);start=0;repeat(1500)@(negedge clk);start=1;
 end endtask
 initial begin
   initialize;run_task;wait(dut.state==9);repeat(5)@(negedge clk);
   if(nx!=6||ny!=4||pulses!=2||nexts!=2)$fatal(1,"normal top stitch progression");
   initialize;return_ok=0;run_task;wait(dut.state==11);repeat(10)@(negedge clk);
   if(!dut.needle_fault_latched||pulses!=2||nexts||nx!=3||ny||needle)$fatal(1,"failed return must stop task");
   start=0;repeat(1500)@(negedge clk);start=1;repeat(1500)@(negedge clk);
   if(dut.state!=11)$fatal(1,"KEY0 bypassed fault");
   text_uart("STATUS?\n",8);repeat(2000)@(negedge clk);
   if(busy_replies!=1)$fatal(1,"Needle fault status must report BUSY");
   text_uart("RESET\n",6);wait(dut.state==1);repeat(10)@(negedge clk);
   if(dut.needle_fault_latched||needle)$fatal(1,"task reset did not clear latch");
   // Blocked sensor must stop before even a jump begins.
   initialize;sensor=1;run_task;wait(dut.state==11);repeat(10)@(negedge clk);
   if(nx||ny||needle||pulses)$fatal(1,"initial blocked motion interlock");
   $display("PASS: top automatic verified stitches, no XY before return, retry fault, KEY0 lockout, RESET, initial motion interlock, no needle error reply and BUSY status");$finish;
 end
 initial begin #150000000;$fatal(1,"top watchdog");end
endmodule
