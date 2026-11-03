# Vivado 2026.1: create the portable project, synthesize, implement and publish bit + reports.
# No programming or hardware motion is performed.
source [file join [file dirname [file normalize [info script]]] create_project.tcl]
set output [file join $root build output]
file mkdir $output
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
file copy -force [file join $project_dir yizhen_qianyun.runs impl_1 board_top.bit] [file join $output yizhen_qianyun_auto_needle.bit]
set firmware_dir [file join $root board firmware]
file mkdir $firmware_dir
file copy -force [file join $output yizhen_qianyun_auto_needle.bit] [file join $firmware_dir yizhen_qianyun_auto_needle.bit]
puts "RELEASE_PASS setup=$setup hold=$hold"
close_project
