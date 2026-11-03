# Usage: vivado -mode batch -source build/build.tcl
set root [file dirname [file dirname [file normalize [info script]]]]
set output [file join $root build output]
file mkdir $output
set_param general.maxThreads 2
create_project -force yizhen_qianyun [file join $output project] -part xc7a100tfgg484-2
add_files [glob [file join $root src rtl *.v]]
set_property top board_top [current_fileset]
add_files -fileset constrs_1 [file join $root board constraints pins.xdc]
set extra [file join $root board constraints camera_clock_route.xdc]
add_files -fileset constrs_1 $extra
set_property USED_IN_SYNTHESIS false [get_files $extra]
update_compile_order -fileset sources_1
launch_runs impl_1 -to_step write_bitstream -jobs 2
wait_on_run impl_1
if {[get_property PROGRESS [get_runs impl_1]] ne "100%"} {error "Implementation failed"}
open_run synth_1
report_utilization -file [file join $output synthesis-utilization.rpt]
close_design
open_run impl_1
report_utilization -file [file join $output implementation-utilization.rpt]
report_timing_summary -delay_type min_max -report_unconstrained -file [file join $output timing.rpt]
report_drc -file [file join $output drc.rpt]
report_route_status -file [file join $output route.rpt]
report_io -file [file join $output io.rpt]
foreach {port pin} {x_step AA15 x_dir AB15 y_step Y16 y_dir AA16 encoder_x_a Y13 encoder_x_b AA14 encoder_y_a AB16 encoder_y_b AB17 needle_trig C18 needle_sensor D20} {
 if {[get_property PACKAGE_PIN [get_ports $port]] ne $pin} {error "Pin mismatch: $port"}
 if {[get_property IOSTANDARD [get_ports $port]] ne "LVCMOS33"} {error "IO voltage mismatch: $port"}
}
set setup [get_property SLACK [get_timing_paths -delay_type max -max_paths 1]]
set hold [get_property SLACK [get_timing_paths -delay_type min -max_paths 1]]
if {$setup < 0 || $hold < 0} {error "Timing failed: setup=$setup hold=$hold"}
file copy -force [file join $output project yizhen_qianyun.runs impl_1 board_top.bit] [file join $output yizhen_qianyun_auto_needle.bit]
puts "RELEASE_PASS setup=$setup hold=$hold"
close_project
