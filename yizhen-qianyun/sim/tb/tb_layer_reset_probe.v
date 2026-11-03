`timescale 1ns/1ps
module tb_layer_reset_probe;
 reg clk=0,rst=0,rxd=1,start=1,stop=1;
 wire txd,xs,ys,needle;wire[3:0]led;
 integer moves=0,done_layers=0,ok_layers=0,caps=0,pongs=0,resets=0;
 reg [7:0] ch;string reply="";
 always #500 clk=~clk;
 top #(.CLK_HZ(1_000_000),.BAUD(100_000),.STEP_START_HZ(1000),.STEP_MAX_HZ(1000),
 .RESET_HOLD_MS(5),.BUTTON_DEBOUNCE_MS(1),.WAIT_DELAY1_MS(1),.NEEDLE_PULSE_MS(1),.WAIT_DELAY2_MS(1)) dut(
 .sys_clk(clk),.sys_rst_n(rst),.uart_rxd(rxd),.uart_txd(txd),.start_button(start),.estop_button(stop),
 .limit_x(1'b0),.limit_y(1'b0),.encoder_x_a(1'b1),.encoder_x_b(1'b1),.encoder_y_a(1'b1),.encoder_y_b(1'b1),
 .needle_sensor(1'b0),.x_step(xs),.y_step(ys),.x_dir(),.y_dir(),.motor_en(),.needle_trig(needle),.needle_sensor_debug(),.led(led),.debug_state());
 always @(posedge xs)if(rst)moves=moves+1;
 always @(negedge txd)if(rst)begin
  #15000;
  for(integer i=0;i<8;i=i+1)begin ch[i]=txd;#10000;end
  if(ch==10)begin
   if(reply=="OK layer")ok_layers=ok_layers+1;
   if(reply=="DONE layer")done_layers=done_layers+1;
   if(reply=="CAP LAYER RESET PING")caps=caps+1;
   if(reply=="PONG 12AB")pongs=pongs+1;
   reply="";
  end else reply={reply,ch};
 end
 task send(input string value);
 begin
  for(integer j=0;j<value.len();j=j+1)begin
   rxd=0;#10000;
   for(integer i=0;i<8;i=i+1)begin rxd=(value[j]>>i)&1;#10000;end
   rxd=1;#10000;
  end
 end endtask
 task key;
 begin start=0;#1500000;start=1;#1500000;end endtask
 initial begin
  repeat(8)@(negedge clk);rst=1;#1500000;
  send("CAP?\n");#3000000;if(caps!=1)$fatal(1,"Capability reply missing");
  send("PING 12AB\n");#2500000;if(pongs!=1)$fatal(1,"Tagged PING failed");
  // Five independently selectable color layers exceed the old four-color task limit.
  for(integer layer=1;layer<=5;layer=layer+1)begin
   send("COLOR layer 1\nJ,2,0\n");wait(dut.state==3);#1500000;
   if(ok_layers!=layer)$fatal(1,"Layer ACK failed");
   key();wait(dut.state==9);#1500000;
   if(done_layers!=layer || dut.pos_x!=0 || dut.pos_y!=0)$fatal(1,"Layer failed to finish/return");
   key();wait(dut.state==1);
  end
  send("COLOR layer 1\nJ,100,0\n");wait(dut.state==3);key();wait(dut.state==4);
  send("PING 12AB\n");#2000000;if(pongs!=2)$fatal(1,"PING stalled during motion");
  send("RESET\n");#3000000;
  if(dut.state!=1||xs||ys||needle||dut.pos_x!=0||dut.expected_points!=0)$fatal(1,"UART reset did not clear task safely");
  send("CAP?\n");#3000000;if(caps!=2)$fatal(1,"Firmware unavailable after reset");
  send("COLOR layer 0\n");wait(dut.state==3);
  stop=0;#10000000;
  if(dut.task_reset_count!=0 || (dut.state!=0 && dut.state!=1)||xs||ys||needle)$fatal(1,"Long KEY1 reset failed or repeated");
  stop=1;#1500000;key();wait(dut.state==1);
  // Reset while KEY0 is held must not auto-start a newly cached job.
  start=0;send("RESET\n");#3000000;
  send("COLOR layer 1\nJ,1,0\n");#3000000;
  if(dut.state!=3||xs||ys)$fatal(1,"Held start caused automatic restart");
  start=1;#1500000;key();wait(dut.state==9);
  $display("PASS: five reusable layers, tagged PING idle/motion, UART reset, held KEY1 one-shot reset, retained firmware response and held-KEY0 restart interlock");$finish;
 end
 initial begin #1_000_000_000;$fatal(1,"Layer/reset/probe test timeout state=%d",dut.state);end
endmodule
