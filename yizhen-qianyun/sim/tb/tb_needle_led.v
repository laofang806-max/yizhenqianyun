`timescale 1ns/1ps
module tb_needle_led;
 reg clk=0,rst=0,rxd=1,start=1;
 wire xs,ys,needle; wire [3:0] led;
 integer nx=0,ny=0,windows=0,needles=0; reg previous_led=0;
 always #500 clk=~clk;
 top #(.CLK_HZ(1_000_000),.BAUD(100_000),.STEP_START_HZ(1000),.STEP_MAX_HZ(1000),
 .BUTTON_DEBOUNCE_MS(1),.WAIT_DELAY1_MS(2),.NEEDLE_PULSE_MS(1),.WAIT_DELAY2_MS(2)) dut(
 .sys_clk(clk),.sys_rst_n(rst),.uart_rxd(rxd),.uart_txd(),
 .start_button(start),.estop_button(1'b1),.limit_x(1'b0),.limit_y(1'b0),
 .encoder_x_a(1'b1),.encoder_x_b(1'b1),.encoder_y_a(1'b1),.encoder_y_b(1'b1),
 .needle_sensor(1'b0),.x_step(xs),.x_dir(),.y_step(ys),.y_dir(),
 .motor_en(),.needle_trig(needle),.needle_sensor_debug(),.led(led),.debug_state());
 always @(posedge xs)if(rst)nx=nx+1;
 always @(posedge ys)if(rst)ny=ny+1;
 always @(posedge needle)if(rst)needles=needles+1;
 always @(negedge clk)if(rst)begin
   if(led[3] !== ((dut.state==5||dut.state==6||dut.state==7)&&!dut.motion_pause))$fatal(1,"LED3 not dedicated to needle window");
   if(led[3] && (xs||ys))$fatal(1,"Platform moved while LED3 on");
   if(led[3]&&!previous_led)begin
     windows=windows+1;
     if(windows==1 && (nx!=3||ny!=0))$fatal(1,"First needle location not reached");
     if(windows==2 && (nx!=3||ny!=2))$fatal(1,"Second needle location not reached");
   end
   previous_led=led[3];
 end
 task byte_uart(input [7:0] v);integer i;
 begin rxd=0;#10000;for(i=0;i<8;i=i+1)begin rxd=v[i];#10000;end rxd=1;#10000;end endtask
 task text_uart(input [127:0] v,input integer n);integer i;
 begin for(i=0;i<n;i=i+1)byte_uart(v[8*(n-i-1)+:8]);end endtask
 initial begin
   repeat(6)@(negedge clk);rst=1;wait(dut.state==1);
   text_uart("COLOR black 4\n",14);
   text_uart("J,3,0\n",6);text_uart("S,0,0\n",6);
   text_uart("J,0,2\n",6);text_uart("S,0,0\n",6);
   wait(dut.state==3);@(negedge clk);start=0;
   repeat(1500)@(negedge clk);start=1;
   wait(dut.state==9);repeat(5)@(negedge clk);
   if(windows!=2||needles!=2||nx!=6||ny!=4||led[3])$fatal(1,"Bad automatic progression or task-complete LED");
   $display("PASS: LED3 marks two stationary stitch locations, skips jumps/return/completion, auto-continues without confirmation");$finish;
 end
 initial begin #100000000;$fatal(1,"Timeout");end
endmodule
