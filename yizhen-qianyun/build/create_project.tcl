# Run from any directory: vivado -mode batch -source build/create_project.tcl
set root [file dirname [file dirname [file normalize [info script]]]]
set project_dir [file join $root build project]
set_param general.maxThreads 2
create_project -force yizhen_qianyun $project_dir -part xc7a100tfgg484-2
set_property target_language Verilog [current_project]
add_files [glob [file join $root src rtl *.v]]
set_property top board_top [get_filesets sources_1]
add_files -fileset constrs_1 [file join $root board constraints pins.xdc]
set extra [file join $root board constraints camera_clock_route.xdc]
add_files -fileset constrs_1 $extra
set_property USED_IN_SYNTHESIS false [get_files $extra]
add_files -fileset sim_1 [glob [file join $root sim tb *.v]]
set_property top tb_needle_ir_top [get_filesets sim_1]
update_compile_order -fileset sources_1
update_compile_order -fileset sim_1
foreach source [get_files -compile_order sources -used_in synthesis] {
 if {![string match "${root}/*" [file normalize $source]]} {error "External source rejected: $source"}
}
puts "PROJECT_CREATED=[file join $project_dir yizhen_qianyun.xpr]"
