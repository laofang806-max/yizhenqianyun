module ov5640_sccb_init #(
    parameter CLK_HZ = 50_000_000,
    parameter SCCB_HZ = 100_000
) (
    input wire clk,
    input wire rst_n,
    input wire camera_enable,
    input wire sda_in,
    output reg reset_n,
    output reg pwdn,
    output reg scl,
    output reg sda_pull_low,
    output reg ready,
    output reg init_error,
    output reg [15:0] error_register,
    output reg [1:0] error_byte
);
    localparam integer HALF_PERIOD = CLK_HZ / (SCCB_HZ * 2);
    localparam [4:0] ST_OFF = 5'd0, ST_POWER_WAIT = 5'd1,
                     ST_PWDN_WAIT = 5'd2, ST_RESET_WAIT = 5'd3,
                     ST_CHECK = 5'd4, ST_START_A = 5'd5,
                     ST_START_B = 5'd6, ST_START_C = 5'd7,
                     ST_SEND_LOW = 5'd8, ST_SEND_HIGH = 5'd9,
                     ST_ACK_LOW = 5'd10, ST_ACK_HIGH = 5'd11,
                     ST_STOP_LOW = 5'd12, ST_STOP_HIGH = 5'd13,
                     ST_STOP_RELEASE = 5'd14, ST_RESET_DELAY = 5'd15,
                     ST_DONE = 5'd16;

    reg [4:0] state;
    reg [31:0] delay_count;
    reg [15:0] tick_count;
    reg [7:0] rom_index;
    reg [1:0] byte_index;
    reg [2:0] bit_index;
    reg [7:0] shift_data;
    reg [23:0] settings [0:255];
    wire tick = tick_count >= HALF_PERIOD - 1;
    wire [23:0] current_setting = settings[rom_index];

    // VGA YUYV preview, 24 MHz module oscillator; vendor guide pp49-54.
    initial begin
        settings[0] = 24'h310311;
        settings[1] = 24'h300882;
        settings[2] = 24'h300842;
        settings[3] = 24'h310303;
        settings[4] = 24'h3017ff;
        settings[5] = 24'h3018ff;
        settings[6] = 24'h310801;
        settings[7] = 24'h30341a;
        settings[8] = 24'h303713;
        settings[9] = 24'h303646;
        settings[10] = 24'h363036;
        settings[11] = 24'h3632e2;
        settings[12] = 24'h363312;
        settings[13] = 24'h363444;
        settings[14] = 24'h3621e0;
        settings[15] = 24'h3704a0;
        settings[16] = 24'h37035a;
        settings[17] = 24'h371578;
        settings[18] = 24'h371701;
        settings[19] = 24'h370b60;
        settings[20] = 24'h37051a;
        settings[21] = 24'h390502;
        settings[22] = 24'h390610;
        settings[23] = 24'h39010a;
        settings[24] = 24'h373112;
        settings[25] = 24'h360008;
        settings[26] = 24'h360133;
        settings[27] = 24'h471c50;
        settings[28] = 24'h382041;
        settings[29] = 24'h382107;
        settings[30] = 24'h381431;
        settings[31] = 24'h381531;
        settings[32] = 24'h380000;
        settings[33] = 24'h380100;
        settings[34] = 24'h380200;
        settings[35] = 24'h380304;
        settings[36] = 24'h38040a;
        settings[37] = 24'h38053f;
        settings[38] = 24'h380607;
        settings[39] = 24'h38079b;
        settings[40] = 24'h380802;
        settings[41] = 24'h380980;
        settings[42] = 24'h380a01;
        settings[43] = 24'h380be0;
        settings[44] = 24'h380c07;
        settings[45] = 24'h380d68;
        settings[46] = 24'h380e03;
        settings[47] = 24'h380fd8;
        settings[48] = 24'h381000;
        settings[49] = 24'h381110;
        settings[50] = 24'h381200;
        settings[51] = 24'h381306;
        settings[52] = 24'h361800;
        settings[53] = 24'h361229;
        settings[54] = 24'h370864;
        settings[55] = 24'h370952;
        settings[56] = 24'h370c03;
        settings[57] = 24'h3a020b;
        settings[58] = 24'h3a0388;
        settings[59] = 24'h3a0801;
        settings[60] = 24'h3a09be;
        settings[61] = 24'h3a0a01;
        settings[62] = 24'h3a0b74;
        settings[63] = 24'h3a0e01;
        settings[64] = 24'h3a0d01;
        settings[65] = 24'h3a140b;
        settings[66] = 24'h3a1588;
        settings[67] = 24'h400102;
        settings[68] = 24'h400402;
        settings[69] = 24'h300000;
        settings[70] = 24'h30021c;
        settings[71] = 24'h3004ff;
        settings[72] = 24'h3006c3;
        settings[73] = 24'h300e58;
        settings[74] = 24'h302e00;
        settings[75] = 24'h430030;
        settings[76] = 24'h501f00;
        settings[77] = 24'h471303;
        settings[78] = 24'h303521;
        settings[79] = 24'h440704;
        settings[80] = 24'h460b35;
        settings[81] = 24'h460c22;
        settings[82] = 24'h382402;
        settings[83] = 24'h5000a7;
        settings[84] = 24'h5001a3;
        settings[85] = 24'h362201;
        settings[86] = 24'h363513;
        settings[87] = 24'h363440;
        settings[88] = 24'h3c0134;
        settings[89] = 24'h3c0000;
        settings[90] = 24'h3c0428;
        settings[91] = 24'h3c0598;
        settings[92] = 24'h3c0600;
        settings[93] = 24'h3c0708;
        settings[94] = 24'h3c0800;
        settings[95] = 24'h3c091c;
        settings[96] = 24'h300c22;
        settings[97] = 24'h3c0a9c;
        settings[98] = 24'h3c0b40;
        settings[99] = 24'h5180ff;
        settings[100] = 24'h5181f2;
        settings[101] = 24'h518200;
        settings[102] = 24'h518314;
        settings[103] = 24'h518425;
        settings[104] = 24'h518524;
        settings[105] = 24'h518606;
        settings[106] = 24'h518709;
        settings[107] = 24'h518809;
        settings[108] = 24'h51897b;
        settings[109] = 24'h518a54;
        settings[110] = 24'h518bb8;
        settings[111] = 24'h518cb2;
        settings[112] = 24'h518d42;
        settings[113] = 24'h518e3d;
        settings[114] = 24'h518f56;
        settings[115] = 24'h519046;
        settings[116] = 24'h5191f8;
        settings[117] = 24'h519204;
        settings[118] = 24'h519370;
        settings[119] = 24'h5194f0;
        settings[120] = 24'h5195f0;
        settings[121] = 24'h519603;
        settings[122] = 24'h519701;
        settings[123] = 24'h519804;
        settings[124] = 24'h519912;
        settings[125] = 24'h519a04;
        settings[126] = 24'h519b00;
        settings[127] = 24'h519c06;
        settings[128] = 24'h519d82;
        settings[129] = 24'h519e38;
        settings[130] = 24'h53811c;
        settings[131] = 24'h53825a;
        settings[132] = 24'h538306;
        settings[133] = 24'h53841b;
        settings[134] = 24'h53856d;
        settings[135] = 24'h538688;
        settings[136] = 24'h53878a;
        settings[137] = 24'h538888;
        settings[138] = 24'h538902;
        settings[139] = 24'h538a01;
        settings[140] = 24'h538b98;
        settings[141] = 24'h530008;
        settings[142] = 24'h530130;
        settings[143] = 24'h530210;
        settings[144] = 24'h530300;
        settings[145] = 24'h530408;
        settings[146] = 24'h530530;
        settings[147] = 24'h530608;
        settings[148] = 24'h530716;
        settings[149] = 24'h530908;
        settings[150] = 24'h530a30;
        settings[151] = 24'h530b04;
        settings[152] = 24'h530c06;
        settings[153] = 24'h548001;
        settings[154] = 24'h548108;
        settings[155] = 24'h548214;
        settings[156] = 24'h548328;
        settings[157] = 24'h548451;
        settings[158] = 24'h548565;
        settings[159] = 24'h548671;
        settings[160] = 24'h54877d;
        settings[161] = 24'h548887;
        settings[162] = 24'h548991;
        settings[163] = 24'h548a9a;
        settings[164] = 24'h548baa;
        settings[165] = 24'h548cb8;
        settings[166] = 24'h548dcd;
        settings[167] = 24'h548edd;
        settings[168] = 24'h548fea;
        settings[169] = 24'h54901d;
        settings[170] = 24'h558002;
        settings[171] = 24'h558340;
        settings[172] = 24'h558410;
        settings[173] = 24'h558910;
        settings[174] = 24'h558a00;
        settings[175] = 24'h558bf8;
        settings[176] = 24'h3a0f30;
        settings[177] = 24'h3a1028;
        settings[178] = 24'h3a1b30;
        settings[179] = 24'h3a1e26;
        settings[180] = 24'h3a1160;
        settings[181] = 24'h3a1f14;
        settings[182] = 24'h3a1800;
        settings[183] = 24'h3a197c;
        settings[184] = 24'h36310e;
        settings[185] = 24'h302d60;
        settings[186] = 24'h362052;
        settings[187] = 24'h371b20;
        settings[188] = 24'h3a1343;
        settings[189] = 24'h363603;
        settings[190] = 24'h40051a;
        settings[191] = 24'h440e00;
        settings[192] = 24'h483722;
        settings[193] = 24'h350300;
        settings[194] = 24'h3007ff;
        settings[195] = 24'h300300;
        settings[196] = 24'h471d01;
        settings[197] = 24'h474021;
        settings[198] = 24'h300802;
        settings[199] = 24'hffffff;
    end

    function [7:0] transfer_byte;
        input [1:0] index;
        input [23:0] setting;
        begin
            case (index)
                0: transfer_byte = 8'h78;
                1: transfer_byte = setting[23:16];
                2: transfer_byte = setting[15:8];
                default: transfer_byte = setting[7:0];
            endcase
        end
    endfunction

    always @* begin
        scl = 1'b1;
        sda_pull_low = 1'b0;
        case (state)
            ST_START_B: begin scl = 1'b1; sda_pull_low = 1'b1; end
            ST_START_C: begin scl = 1'b0; sda_pull_low = 1'b1; end
            ST_SEND_LOW: begin scl = 1'b0; sda_pull_low = !shift_data[7]; end
            ST_SEND_HIGH: begin scl = 1'b1; sda_pull_low = !shift_data[7]; end
            ST_ACK_LOW: begin scl = 1'b0; sda_pull_low = 1'b0; end
            ST_ACK_HIGH: begin scl = 1'b1; sda_pull_low = 1'b0; end
            ST_STOP_LOW: begin scl = 1'b0; sda_pull_low = 1'b1; end
            ST_STOP_HIGH: begin scl = 1'b1; sda_pull_low = 1'b1; end
            ST_STOP_RELEASE: begin scl = 1'b1; sda_pull_low = 1'b0; end
            default: begin scl = 1'b1; sda_pull_low = 1'b0; end
        endcase
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_OFF;
            delay_count <= 0;
            tick_count <= 0;
            rom_index <= 0;
            byte_index <= 0;
            bit_index <= 0;
            shift_data <= 0;
            reset_n <= 1'b0;
            pwdn <= 1'b1;
            ready <= 1'b0;
            init_error <= 1'b0;
            error_register <= 16'd0;
            error_byte <= 2'd0;
        end else if (!camera_enable) begin
            state <= ST_OFF;
            delay_count <= 0;
            tick_count <= 0;
            rom_index <= 0;
            reset_n <= 1'b1;
            pwdn <= 1'b1;
            ready <= 1'b0;
            init_error <= 1'b0;
            error_register <= 16'd0;
            error_byte <= 2'd0;
        end else begin
            if (state == ST_START_A || state == ST_START_B || state == ST_START_C ||
                state == ST_SEND_LOW || state == ST_SEND_HIGH || state == ST_ACK_LOW ||
                state == ST_ACK_HIGH || state == ST_STOP_LOW || state == ST_STOP_HIGH ||
                state == ST_STOP_RELEASE) begin
                if (tick) tick_count <= 0;
                else tick_count <= tick_count + 1'b1;
            end else tick_count <= 0;

            case (state)
                ST_OFF: begin
                    reset_n <= 1'b0;
                    pwdn <= 1'b1;
                    ready <= 1'b0;
                    init_error <= 1'b0;
            error_register <= 16'd0;
            error_byte <= 2'd0;
                    delay_count <= 0;
                    state <= ST_POWER_WAIT;
                end
                ST_POWER_WAIT: begin
                    if (delay_count >= (CLK_HZ / 1000) * 5) begin
                        pwdn <= 1'b0;
                        delay_count <= 0;
                        state <= ST_PWDN_WAIT;
                    end else delay_count <= delay_count + 1'b1;
                end
                ST_PWDN_WAIT: begin
                    if (delay_count >= (CLK_HZ / 1000)) begin
                        reset_n <= 1'b1;
                        delay_count <= 0;
                        state <= ST_RESET_WAIT;
                    end else delay_count <= delay_count + 1'b1;
                end
                ST_RESET_WAIT: begin
                    if (delay_count >= (CLK_HZ / 1000) * 20) begin
                        delay_count <= 0;
                        rom_index <= 0;
                        state <= ST_CHECK;
                    end else delay_count <= delay_count + 1'b1;
                end
                ST_CHECK: begin
                    if (current_setting == 24'hffffff) begin
                        ready <= 1'b1;
                        state <= ST_DONE;
                    end else begin
                        byte_index <= 0;
                        bit_index <= 0;
                        shift_data <= 8'h78;
                        state <= ST_START_A;
                    end
                end
                ST_START_A: if (tick) state <= ST_START_B;
                ST_START_B: if (tick) state <= ST_START_C;
                ST_START_C: if (tick) state <= ST_SEND_LOW;
                ST_SEND_LOW: if (tick) state <= ST_SEND_HIGH;
                ST_SEND_HIGH: begin
                    if (tick) begin
                        if (bit_index == 3'd7) begin
                            state <= ST_ACK_LOW;
                        end else begin
                            bit_index <= bit_index + 1'b1;
                            shift_data <= {shift_data[6:0], 1'b0};
                            state <= ST_SEND_LOW;
                        end
                    end
                end
                ST_ACK_LOW: if (tick) state <= ST_ACK_HIGH;
                ST_ACK_HIGH: begin
                    if (tick) begin
                        if (sda_in !== 1'b0) begin
                            init_error <= 1'b1;
                            if (!init_error) begin
                                error_register <= current_setting[23:8];
                                error_byte <= byte_index;
                            end
                        end
                        if (byte_index == 2'd3) begin
                            state <= ST_STOP_LOW;
                        end else begin
                            byte_index <= byte_index + 1'b1;
                            bit_index <= 0;
                            shift_data <= transfer_byte(byte_index + 1'b1, current_setting);
                            state <= ST_SEND_LOW;
                        end
                    end
                end
                ST_STOP_LOW: if (tick) state <= ST_STOP_HIGH;
                ST_STOP_HIGH: if (tick) state <= ST_STOP_RELEASE;
                ST_STOP_RELEASE: begin
                    if (tick) begin
                        if (current_setting == 24'h300882) begin
                            delay_count <= 0;
                            state <= ST_RESET_DELAY;
                        end else begin
                            rom_index <= rom_index + 1'b1;
                            state <= ST_CHECK;
                        end
                    end
                end
                ST_RESET_DELAY: begin
                    if (delay_count >= (CLK_HZ / 1000) * 5) begin
                        delay_count <= 0;
                        rom_index <= rom_index + 1'b1;
                        state <= ST_CHECK;
                    end else delay_count <= delay_count + 1'b1;
                end
                ST_DONE: ready <= 1'b1;
                default: state <= ST_OFF;
            endcase
        end
    end
endmodule
// Read sensor identity and format after the write sequencer releases SCCB.
module ov5640_readback #(
 parameter CLK_HZ=50_000_000, SCCB_HZ=100_000
)(input wire clk,rst_n,enable,sda_in,
 output reg scl,sda_pull_low,complete,error,
 output reg [31:0] values);
 localparam HALF=CLK_HZ/(SCCB_HZ*2);
 localparam IDLE=0,START_A=1,START_B=2,START_C=3,SEND_LOW=4,SEND_HIGH=5,
 ACK_LOW=6,ACK_HIGH=7,READ_LOW=8,READ_HIGH=9,NACK_LOW=10,NACK_HIGH=11,
 STOP_LOW=12,STOP_HIGH=13,STOP_RELEASE=14,DONE=15;
 reg [3:0] state;
 reg [15:0] timer;
 reg [1:0] reg_index,byte_index;
 reg [2:0] bit_index;
 reg read_phase;
 reg [7:0] shift,received;
 wire tick=timer>=HALF-1;
 reg [15:0] address;
 always @* case(reg_index)
  0:address=16'h300a;1:address=16'h300b;
  2:address=16'h4300;default:address=16'h3821;
 endcase
 always @* begin
  scl=1;sda_pull_low=0;
  case(state)
   START_B: sda_pull_low=1;
   START_C,STOP_LOW: begin scl=0;sda_pull_low=1;end
   SEND_LOW:begin scl=0;sda_pull_low=!shift[7];end
   SEND_HIGH:sda_pull_low=!shift[7];
   ACK_LOW,READ_LOW,NACK_LOW:scl=0;
   STOP_HIGH:sda_pull_low=1;
   default:begin end
  endcase
 end
 always @(posedge clk or negedge rst_n) begin
  if(!rst_n) begin
   state<=IDLE;timer<=0;reg_index<=0;byte_index<=0;bit_index<=0;
   read_phase<=0;shift<=0;received<=0;values<=0;complete<=0;error<=0;
  end else if(!enable) begin
   state<=IDLE;timer<=0;reg_index<=0;byte_index<=0;bit_index<=0;
   read_phase<=0;shift<=0;received<=0;values<=0;complete<=0;error<=0;
  end else begin
   if(tick) timer<=0;else timer<=timer+1'b1;
   if(state==IDLE) begin
    state<=START_A;shift<=8'h78;byte_index<=0;bit_index<=0;
   end else if(tick) case(state)
    START_A:state<=START_B;
    START_B:state<=START_C;
    START_C:state<=SEND_LOW;
    SEND_LOW:state<=SEND_HIGH;
    SEND_HIGH:begin
     if(bit_index==7) state<=ACK_LOW;
     else begin bit_index<=bit_index+1'b1;shift<={shift[6:0],1'b0};state<=SEND_LOW;end
    end
    ACK_LOW:state<=ACK_HIGH;
    ACK_HIGH:begin
     if(sda_in!==0) error<=1;
     bit_index<=0;
     if(read_phase) begin received<=0;state<=READ_LOW;end
     else if(byte_index==2) state<=STOP_LOW;
     else begin
      byte_index<=byte_index+1'b1;
      shift<=byte_index==0 ? address[15:8]:address[7:0];state<=SEND_LOW;
     end
    end
    READ_LOW:state<=READ_HIGH;
    READ_HIGH:begin
     received<={received[6:0],sda_in};
     if(bit_index==7)state<=NACK_LOW;
     else begin bit_index<=bit_index+1'b1;state<=READ_LOW;end
    end
    NACK_LOW:state<=NACK_HIGH;
    NACK_HIGH:state<=STOP_LOW;
    STOP_LOW:state<=STOP_HIGH;
    STOP_HIGH:state<=STOP_RELEASE;
    STOP_RELEASE:begin
     if(!read_phase) begin
      read_phase<=1;shift<=8'h79;byte_index<=0;bit_index<=0;state<=START_A;
     end else begin
      case(reg_index)
       0:values[31:24]<=received;1:values[23:16]<=received;
       2:values[15:8]<=received;3:values[7:0]<=received;
      endcase
      if(reg_index==3)begin complete<=1;state<=DONE;end
      else begin
       reg_index<=reg_index+1'b1;read_phase<=0;shift<=8'h78;
       byte_index<=0;bit_index<=0;state<=START_A;
      end
     end
    end
    default:begin end
   endcase
  end
 end
endmodule

