# Board reference XDC uses LVCMOS15 for bank-34/35 clock/reset/buttons/LEDs.
# Motor/camera/UART interfaces remain LVCMOS33 in their respective banks.
# 正点原子达芬奇Pro引脚表示例。基础资源引脚来自随板 IO 分配表。
# 请先核对板卡具体版本、FPGA封装、IO Bank 电压及原理图，再生成 bitstream。
set_property -dict {PACKAGE_PIN R4  IOSTANDARD LVCMOS15} [get_ports sys_clk]
set_property -dict {PACKAGE_PIN U7  IOSTANDARD LVCMOS15} [get_ports sys_rst_n]
set_property -dict {PACKAGE_PIN E14 IOSTANDARD LVCMOS33} [get_ports uart_rxd]
set_property -dict {PACKAGE_PIN D17 IOSTANDARD LVCMOS33} [get_ports uart_txd]
set_property -dict {PACKAGE_PIN T4  IOSTANDARD LVCMOS15} [get_ports start_button]
set_property -dict {PACKAGE_PIN T3  IOSTANDARD LVCMOS15} [get_ports estop_button]
set_property -dict {PACKAGE_PIN R6  IOSTANDARD LVCMOS15} [get_ports key2_button]
set_property -dict {PACKAGE_PIN V9  IOSTANDARD LVCMOS15} [get_ports {led[0]}]
set_property -dict {PACKAGE_PIN Y8  IOSTANDARD LVCMOS15} [get_ports {led[1]}]
set_property -dict {PACKAGE_PIN Y7  IOSTANDARD LVCMOS15} [get_ports {led[2]}]
set_property -dict {PACKAGE_PIN W7  IOSTANDARD LVCMOS15} [get_ports {led[3]}]
create_clock -period 20.000 -name sys_clk [get_ports sys_clk]
create_clock -period 16.667 -name usb_clk_60m [get_ports usb_clk_60m]
create_clock -period 11.905 -name cam_pclk [get_ports cam_pclk]
set_clock_groups -asynchronous \
	-group [get_clocks sys_clk] \
	-group [get_clocks -include_generated_clocks usb_clk_60m] \
	-group [get_clocks cam_pclk]

# Camera connector pins from the board IO table and V2.6 schematic.
set_property -dict {PACKAGE_PIN P17 IOSTANDARD LVCMOS33} [get_ports {cam_data[0]}]
set_property -dict {PACKAGE_PIN P15 IOSTANDARD LVCMOS33} [get_ports {cam_data[1]}]
set_property -dict {PACKAGE_PIN R16 IOSTANDARD LVCMOS33} [get_ports {cam_data[2]}]
set_property -dict {PACKAGE_PIN R17 IOSTANDARD LVCMOS33} [get_ports {cam_data[3]}]
set_property -dict {PACKAGE_PIN P16 IOSTANDARD LVCMOS33} [get_ports {cam_data[4]}]
set_property -dict {PACKAGE_PIN V17 IOSTANDARD LVCMOS33} [get_ports {cam_data[5]}]
set_property -dict {PACKAGE_PIN W17 IOSTANDARD LVCMOS33} [get_ports {cam_data[6]}]
set_property -dict {PACKAGE_PIN U17 IOSTANDARD LVCMOS33} [get_ports {cam_data[7]}]
set_property -dict {PACKAGE_PIN U18 IOSTANDARD LVCMOS33} [get_ports cam_pclk]
# The fixed camera connector routes PCLK to U18, a non-CCIO pin on this part
# (IO_L18N_T2_A11_D27_14). Only its IBUF-to-BUFG segment may use fabric routing.
# Keep the BUFG and timing checks; this exception does not validate external
# DVP setup/hold timing. Verify camera sampling margin on the physical board.
# The implementation-only camera_clock_route.xdc applies the post-IBUF exception.
set_property -dict {PACKAGE_PIN N17 IOSTANDARD LVCMOS33} [get_ports cam_reset_n]
set_property -dict {PACKAGE_PIN AB18 IOSTANDARD LVCMOS33} [get_ports cam_pwdn]
set_property -dict {PACKAGE_PIN P14 IOSTANDARD LVCMOS33} [get_ports cam_vsync]
set_property -dict {PACKAGE_PIN N14 IOSTANDARD LVCMOS33} [get_ports cam_href]
set_property -dict {PACKAGE_PIN N13 IOSTANDARD LVCMOS33} [get_ports cam_scl]
set_property -dict {PACKAGE_PIN R14 IOSTANDARD LVCMOS33} [get_ports cam_sda]

# FT232HL USB Slave synchronous FIFO pins from the board IO table.
set_property -dict {PACKAGE_PIN D19 IOSTANDARD LVCMOS33} [get_ports usb_oe_n]
set_property -dict {PACKAGE_PIN E17 IOSTANDARD LVCMOS33} [get_ports usb_txe_n]
set_property -dict {PACKAGE_PIN F16 IOSTANDARD LVCMOS33} [get_ports usb_rxf_n]
set_property -dict {PACKAGE_PIN F20 IOSTANDARD LVCMOS33} [get_ports usb_wr_n]
set_property -dict {PACKAGE_PIN F19 IOSTANDARD LVCMOS33} [get_ports usb_rd_n]
set_property -dict {PACKAGE_PIN E19 IOSTANDARD LVCMOS33} [get_ports usb_clk_60m]
set_property -dict {PACKAGE_PIN C17 IOSTANDARD LVCMOS33} [get_ports {usb_data[0]}]
set_property -dict {PACKAGE_PIN F15 IOSTANDARD LVCMOS33} [get_ports {usb_data[1]}]
set_property -dict {PACKAGE_PIN F18 IOSTANDARD LVCMOS33} [get_ports {usb_data[2]}]
set_property -dict {PACKAGE_PIN E18 IOSTANDARD LVCMOS33} [get_ports {usb_data[3]}]
set_property -dict {PACKAGE_PIN E21 IOSTANDARD LVCMOS33} [get_ports {usb_data[4]}]
set_property -dict {PACKAGE_PIN D21 IOSTANDARD LVCMOS33} [get_ports {usb_data[5]}]
set_property -dict {PACKAGE_PIN F21 IOSTANDARD LVCMOS33} [get_ports {usb_data[6]}]
set_property -dict {PACKAGE_PIN E22 IOSTANDARD LVCMOS33} [get_ports {usb_data[7]}]
set_property -dict {PACKAGE_PIN G21 IOSTANDARD LVCMOS33} [get_ports usb_siwu_n]

# Motor outputs on J4 Bank13; spare stitch-control pins remain on J3.
set_property -dict {PACKAGE_PIN AA15 IOSTANDARD LVCMOS33} [get_ports x_step]
set_property -dict {PACKAGE_PIN AB15 IOSTANDARD LVCMOS33} [get_ports x_dir]
set_property -dict {PACKAGE_PIN Y16 IOSTANDARD LVCMOS33} [get_ports y_step]
set_property -dict {PACKAGE_PIN AA16 IOSTANDARD LVCMOS33} [get_ports y_dir]
set_property -dict {PACKAGE_PIN C13 IOSTANDARD LVCMOS33} [get_ports limit_x]
set_property -dict {PACKAGE_PIN C14 IOSTANDARD LVCMOS33} [get_ports limit_y]
set_property -dict {PACKAGE_PIN C18 IOSTANDARD LVCMOS33} [get_ports needle_trig]
set_property -dict {PACKAGE_PIN D20 IOSTANDARD LVCMOS33} [get_ports needle_sensor]
set_property -dict {PACKAGE_PIN E16 IOSTANDARD LVCMOS33} [get_ports needle_sensor_debug]

# Do not connect TB6600 STEP/DIR to camera-shared pins. The motor pins above
# use J4-31/32/35/36 (Bank13); X/Y limits use J3-17/19. See WIRING.md.
# Camera-shared J3 pins are left unused by the motor and limit interfaces.
# needle_trig   J3-23 EXT_5_P   C18
# needle_sensor J3-27 EXT_4_P   D20
# needle_sensor_debug J3-35 EXT_16_P E16
#
# Do not use A8/B8 from the core-board J3 MGT_RX0 pair as GPIO. Confirm that
# the installed core board matches V4.1 and use a verified interface between
# FPGA 3.3 V IO and TB6600 inputs.

# FT232H datasheet v2.2 table 4.1: input tCO <=9ns, output setup >=7.5ns.
# Include a small board margin; only synchronous FIFO ports use these delays.
set_input_delay -clock usb_clk_60m -max 9.2 [get_ports {usb_txe_n usb_rxf_n usb_data[*]}]
set_input_delay -clock usb_clk_60m -min 0.0 [get_ports {usb_txe_n usb_rxf_n usb_data[*]}]
set_output_delay -clock usb_clk_60m -max 7.7 [get_ports {usb_wr_n usb_rd_n usb_oe_n usb_data[*]}]
set_output_delay -clock usb_clk_60m -min 0.0 [get_ports {usb_wr_n usb_rd_n usb_oe_n usb_data[*]}]

# Incremental NPN open-collector encoders. External 3.3k pull-ups to 3.3V required.
# J4-27 Y13=X A; J4-28 AA14=X B; J4-33 AB16=Y A; J4-34 AB17=Y B.
set_property -dict {PACKAGE_PIN Y13 IOSTANDARD LVCMOS33 PULLUP TRUE} [get_ports encoder_x_a]
set_property -dict {PACKAGE_PIN AA14 IOSTANDARD LVCMOS33 PULLUP TRUE} [get_ports encoder_x_b]
set_property -dict {PACKAGE_PIN AB16 IOSTANDARD LVCMOS33 PULLUP TRUE} [get_ports encoder_y_a]
set_property -dict {PACKAGE_PIN AB17 IOSTANDARD LVCMOS33 PULLUP TRUE} [get_ports encoder_y_b]
# Only asynchronous encoder inputs to the first synchronizer stage are excluded.
set_false_path -from [get_ports {encoder_x_a encoder_x_b encoder_y_a encoder_y_b}] -to [get_cells -hier -filter {NAME =~ *u_encoder_monitor/*_meta_reg*}]


