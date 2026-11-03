module board_top #(
    parameter CLK_HZ = 50_000_000,
    parameter BAUD = 115200,
    parameter NEEDLE_FEEDBACK_ENABLE = 1,
    parameter NEEDLE_SENSOR_ACTIVE_LOW = 0,
    parameter NEEDLE_SENSOR_DEBOUNCE_MS = 1,
    parameter NEEDLE_PULSE_MS = 20,
    parameter NEEDLE_RETRY_WAIT_MS = 200,
    parameter NEEDLE_MAX_PULSES = 3,
    parameter NEEDLE_DOWN_TIMEOUT_MS = 1000,
    parameter NEEDLE_RETURN_TIMEOUT_MS = 2000,
    // 400Hz start, 12000Hz ceiling and 192 ramp steps for short stitch moves.
    // ACCEL_TIME_MS sets ramp steps, not elapsed ramp time. Needle timing is unchanged.
    parameter MOTOR_STEP_START_HZ = 400,
    parameter MOTOR_STEP_MAX_HZ = 12000,
    parameter MOTOR_ACCEL_TIME_MS = 16,
    parameter MOTOR_STEP_PULSE_US = 5,
    parameter MOTOR_STEPS_PER_MM = 1600,
    parameter MOTOR_CLOSED_LOOP_ENABLE = 1,
    parameter ENCODER_TOLERANCE_COUNTS = 10,
    parameter ENCODER_INVERT_X = 0,
    parameter ENCODER_INVERT_Y = 0,
    parameter ENCODER_REPORT_CYCLES = CLK_HZ / 5,
    parameter USB_CLK_HZ = 60_000_000,
    parameter STATUS_INTERVAL_CYCLES = USB_CLK_HZ
) (
    input wire sys_clk,
    input wire sys_rst_n,
    input wire uart_rxd,
    output wire uart_txd,
    input wire start_button,
    input wire estop_button,
    input wire key2_button,
    input wire limit_x,
    input wire limit_y,
    input wire needle_sensor,
    input wire encoder_x_a,
    input wire encoder_x_b,
    input wire encoder_y_a,
    input wire encoder_y_b,
    output wire x_step,
    output wire x_dir,
    output wire y_step,
    output wire y_dir,
    input wire cam_pclk,
    input wire cam_vsync,
    input wire cam_href,
    inout wire [7:0] cam_data,
    inout wire cam_reset_n,
    inout wire cam_pwdn,
    inout wire cam_scl,
    inout wire cam_sda,
    input wire usb_clk_60m,
    input wire usb_txe_n,
    input wire usb_rxf_n,
    inout wire [7:0] usb_data,
    output wire usb_oe_n,
    output wire usb_rd_n,
    output wire usb_wr_n,
    output wire usb_siwu_n,
    output wire needle_trig,
    output wire needle_sensor_debug,
    output wire [3:0] led
);
    wire usb_clk_fifo,usb_clock_locked;
    wire usb_fifo_rst_n=sys_rst_n && usb_clock_locked;
`ifdef SYNTHESIS
    wire usb_clock_raw,usb_feedback_raw,usb_feedback;
    // Deskew the FTDI CLKOUT through MMCM/BUFG feedback. A plain BUFG adds
    // several ns of clock insertion against the external FIFO setup budget.
    MMCME2_BASE #(.CLKIN1_PERIOD(16.667),.CLKFBOUT_MULT_F(12.0),
      .CLKOUT0_DIVIDE_F(12.0),.DIVCLK_DIVIDE(1),.STARTUP_WAIT("FALSE")) u_usb_mmcm (
      .CLKIN1(usb_clk_60m),.CLKFBIN(usb_feedback),.RST(!sys_rst_n),.PWRDWN(1'b0),
      .CLKFBOUT(usb_feedback_raw),.CLKOUT0(usb_clock_raw),.LOCKED(usb_clock_locked),
      .CLKFBOUTB(),.CLKOUT0B(),.CLKOUT1(),.CLKOUT1B(),.CLKOUT2(),.CLKOUT2B(),
      .CLKOUT3(),.CLKOUT3B(),.CLKOUT4(),.CLKOUT5(),.CLKOUT6());
    BUFG u_usb_feedback(.I(usb_feedback_raw),.O(usb_feedback));
    BUFG u_usb_clock(.I(usb_clock_raw),.O(usb_clk_fifo));
`else
    assign usb_clk_fifo=usb_clk_60m;
    assign usb_clock_locked=sys_rst_n;
`endif
    wire key2_active;
    wire motion_x_step, motion_x_dir, motion_y_step, motion_y_dir;
    wire motor_en;
    wire [3:0] unused_debug_state;
    wire stream_enable_request;
    wire camera_stream_enable;
    wire [7:0] usb_data_input = usb_data;
    wire [7:0] usb_data_output;
    wire [7:0] video_data_output;
    wire video_wr_n, video_data_oe, video_siwu_n, video_idle, status_block;
    wire tx_source_ready,tx_buffer_busy,tx_source_wr_n,tx_source_siwu_n;
    wire [7:0] tx_source_data;
    wire [15:0] camera_error_register;
    wire [1:0] camera_error_byte;
    (* ASYNC_REG = "TRUE" *) reg request_sys_sync1, request_sys_sync2;
    (* ASYNC_REG = "TRUE" *) reg [31:0] status_sync1, status_sync2;
    (* ASYNC_REG = "TRUE" *) reg [2:0] dvp_sync1, dvp_sync2;
    (* ASYNC_REG = "TRUE" *) reg pclk_sync1, pclk_sync2;
    reg pclk_previous, vsync_previous, vsync_seen, href_seen;
    reg [7:0] pclk_divider;
    localparam WATCHDOG_CYCLES = USB_CLK_HZ / 100;
    localparam WATCHDOG_WIDTH = $clog2(WATCHDOG_CYCLES + 1);
    reg [WATCHDOG_WIDTH-1:0] pclk_timeout;
    wire pclk_alive = pclk_timeout < WATCHDOG_CYCLES;
    wire [31:0] camera_status = {status_sync2[31:16], 6'd0,
        status_sync2[9:8], camera_stream_enable, status_sync2[6],
        dvp_sync2[2], href_seen, vsync_seen, pclk_alive, status_sync2[1:0]};

    always @(posedge cam_pclk or negedge sys_rst_n) begin
        if (!sys_rst_n) pclk_divider <= 0;
        else pclk_divider <= pclk_divider + 1'b1;
    end

    always @(posedge sys_clk or negedge sys_rst_n) begin
        if (!sys_rst_n) begin
            request_sys_sync1 <= 0;
            request_sys_sync2 <= 0;
        end else begin
            request_sys_sync1 <= stream_enable_request;
            request_sys_sync2 <= request_sys_sync1;
        end
    end

    wire usb_data_output_enable;
    wire camera_ready;
    wire readback_scl,readback_pull_low,readback_complete,readback_error;
    wire [31:0] readback_values;
    (* ASYNC_REG="TRUE" *) reg [31:0] readback_sync1,readback_sync2;
    (* ASYNC_REG="TRUE" *) reg [1:0] readback_state1,readback_state2;
    (* ASYNC_REG="TRUE" *) reg capture_enabled1,capture_enabled2;
    reg [7:0] data_or,data_and;
    (* ASYNC_REG="TRUE" *) reg [15:0] activity_sync1,activity_sync2;
    always @(posedge cam_pclk or negedge sys_rst_n) begin
      if(!sys_rst_n) begin capture_enabled1<=0;capture_enabled2<=0;data_or<=0;data_and<=8'hff;end
      else begin
        capture_enabled1<=camera_stream_enable;capture_enabled2<=capture_enabled1;
        if(!capture_enabled2) begin data_or<=0;data_and<=8'hff;end
        else if(cam_href) begin data_or<=data_or|cam_data;data_and<=data_and&cam_data;end
      end
    end
    always @(posedge usb_clk_fifo or negedge usb_fifo_rst_n) begin
      if(!usb_fifo_rst_n) begin readback_sync1<=0;readback_sync2<=0;readback_state1<=0;readback_state2<=0;activity_sync1<=0;activity_sync2<=0;end
      else begin
        readback_sync1<=readback_values;readback_sync2<=readback_sync1;
        readback_state1<={readback_error,readback_complete};readback_state2<=readback_state1;
        activity_sync1<={data_or,data_and};activity_sync2<=activity_sync1;
      end
    end
    wire camera_reset_n;
    wire camera_pwdn;
    wire camera_scl;
    wire camera_sda_pull_low;
    wire camera_init_error;
    wire camera_capture_done;
    wire camera_stream_active;
    wire camera_overflow;
    wire key2_capture_pulse;
    reg key2_usb_sync1, key2_usb_sync2, key2_usb_previous;
    assign camera_stream_enable = stream_enable_request &&
                                status_sync2[0] && !status_sync2[1];

    input_filter #(
        .CLK_HZ(CLK_HZ), .DEBOUNCE_MS(10), .ACTIVE_LOW(1)
    ) u_key2_filter (
        .clk(sys_clk), .rst_n(sys_rst_n), .async_in(key2_button), .active(key2_active)
    );

    always @(posedge usb_clk_fifo or negedge usb_fifo_rst_n) begin
        if (!usb_fifo_rst_n) begin
            key2_usb_sync1 <= 1'b0;
            key2_usb_sync2 <= 1'b0;
            key2_usb_previous <= 1'b0;
            status_sync1 <= 0; status_sync2 <= 0;
            dvp_sync1 <= 0; dvp_sync2 <= 0;
            pclk_sync1 <= 0; pclk_sync2 <= 0; pclk_previous <= 0;
            pclk_timeout <= WATCHDOG_CYCLES;
            vsync_previous <= 0; vsync_seen <= 0; href_seen <= 0;
        end else begin
            key2_usb_sync1 <= key2_active;
            key2_usb_sync2 <= key2_usb_sync1;
            key2_usb_previous <= key2_usb_sync2;
            status_sync1 <= {camera_error_register, 6'd0, camera_error_byte,
                             1'b0, request_sys_sync2, 4'd0, camera_init_error, camera_ready};
            status_sync2 <= status_sync1;
            dvp_sync1 <= {camera_overflow, cam_href, cam_vsync};
            dvp_sync2 <= dvp_sync1;
            pclk_sync1 <= pclk_divider[7]; pclk_sync2 <= pclk_sync1;
            pclk_previous <= pclk_sync2;
            if (pclk_sync2 != pclk_previous) pclk_timeout <= 0;
            else if (pclk_timeout < WATCHDOG_CYCLES) pclk_timeout <= pclk_timeout + 1'b1;
            vsync_previous <= dvp_sync2[0];
            if (!stream_enable_request || !status_sync2[0]) begin
                vsync_seen <= 0;
                href_seen <= 0;
            end else begin
                if (dvp_sync2[0] && !vsync_previous) vsync_seen <= 1;
                if (dvp_sync2[1]) href_seen <= 1;
            end
        end
    end

    assign key2_capture_pulse = key2_usb_sync2 && !key2_usb_previous;

    ft232h_stream_start u_ft232h_start (
        .usb_clk_60m(usb_clk_fifo), .rst_n(usb_fifo_rst_n),
        .usb_rxf_n(usb_rxf_n || tx_buffer_busy), .usb_data_in(usb_data_input),
        .usb_oe_n(usb_oe_n), .usb_rd_n(usb_rd_n),
        .stream_enable(stream_enable_request)
    );

    camera_usb_stream #(
        .FRAME_WIDTH(640), .FRAME_HEIGHT(480),
        .FRAME_DIVIDER(3), .FIFO_ADDR_WIDTH(18),
        .VSYNC_ACTIVE_LEVEL(1)
    ) u_camera_stream (
        .rst_n(usb_fifo_rst_n),
        .cam_pclk(cam_pclk), .cam_href(cam_href), .cam_vsync(cam_vsync),
        .cam_data(cam_data), .usb_clk_60m(usb_clk_fifo), .usb_txe_n(!tx_source_ready || !usb_oe_n || status_block),
        .stream_enable(camera_stream_enable), .capture_pulse(key2_capture_pulse),
        .capture_done(camera_capture_done), .stream_active(camera_stream_active),
        .overflow(camera_overflow), .usb_wr_n(video_wr_n),
        .usb_oe_n(), .usb_rd_n(), .usb_siwu_n(video_siwu_n),
        .usb_data_oe(video_data_oe), .usb_data_out(video_data_output),
        .packet_idle(video_idle)
    );

    camera_status_mux #(.INTERVAL_CYCLES(STATUS_INTERVAL_CYCLES)) u_status (
        .clk(usb_clk_fifo), .rst_n(usb_fifo_rst_n), .enable(stream_enable_request),
        .txe_n(!tx_source_ready), .rx_oe_n(usb_oe_n), .video_idle(video_idle),
        .video_wr_n(video_wr_n), .video_data_oe(video_data_oe),
        .video_siwu_n(video_siwu_n), .video_data(video_data_output),
        .status_flags(camera_status),
        .readback_value(readback_sync2), .data_activity({14'd0,readback_state2,activity_sync2}), .video_block(status_block),
        .wr_n(tx_source_wr_n), .data_oe(),
        .siwu_n(tx_source_siwu_n), .data_out(tx_source_data)
    );

    ft232h_tx_register u_usb_tx (
      .clk(usb_clk_fifo),.rst_n(usb_fifo_rst_n),.txe_n(usb_txe_n),
      .rxf_n(usb_rxf_n),.rx_oe_n(usb_oe_n),
      .source_wr_n(tx_source_wr_n),.source_siwu_n(tx_source_siwu_n),
      .source_data(tx_source_data),.source_ready(tx_source_ready),.busy(tx_buffer_busy),
      .wr_n(usb_wr_n),.data_out(usb_data_output),.data_oe(usb_data_output_enable),.siwu_n(usb_siwu_n));
    assign usb_data = usb_data_output_enable ? usb_data_output : 8'hzz;

    ov5640_sccb_init #(.CLK_HZ(CLK_HZ)) u_camera_init (
        .clk(sys_clk), .rst_n(sys_rst_n), .camera_enable(request_sys_sync2),
        .sda_in(cam_sda), .reset_n(camera_reset_n), .pwdn(camera_pwdn),
        .scl(camera_scl), .sda_pull_low(camera_sda_pull_low),
        .ready(camera_ready), .init_error(camera_init_error),
        .error_register(camera_error_register), .error_byte(camera_error_byte)
    );

    assign cam_reset_n = camera_reset_n;
    assign cam_pwdn = camera_pwdn;
    ov5640_readback #(.CLK_HZ(CLK_HZ)) u_readback (
      .clk(sys_clk),.rst_n(sys_rst_n),.enable(camera_ready && !camera_init_error),
      .sda_in(cam_sda),.scl(readback_scl),.sda_pull_low(readback_pull_low),
      .complete(readback_complete),.error(readback_error),.values(readback_values));
    assign cam_scl = camera_ready && !camera_init_error ? readback_scl : camera_scl;
    assign cam_sda = (camera_sda_pull_low || readback_pull_low) ? 1'b0 : 1'bz;
    assign x_step = motion_x_step;
    assign x_dir = motion_x_dir;
    assign y_step = motion_y_step;
    assign y_dir = motion_y_dir;

    top #(
        .CLK_HZ(CLK_HZ), .BAUD(BAUD),
        .NEEDLE_FEEDBACK_ENABLE(NEEDLE_FEEDBACK_ENABLE),
        .NEEDLE_SENSOR_ACTIVE_LOW(NEEDLE_SENSOR_ACTIVE_LOW),
        .NEEDLE_SENSOR_DEBOUNCE_MS(NEEDLE_SENSOR_DEBOUNCE_MS),
        .WAIT_DELAY1_MS(20),.NEEDLE_PULSE_MS(NEEDLE_PULSE_MS),.WAIT_DELAY2_MS(20),
        .NEEDLE_RETRY_WAIT_MS(NEEDLE_RETRY_WAIT_MS),.NEEDLE_MAX_PULSES(NEEDLE_MAX_PULSES),
        .NEEDLE_DOWN_TIMEOUT_MS(NEEDLE_DOWN_TIMEOUT_MS),.NEEDLE_RETURN_TIMEOUT_MS(NEEDLE_RETURN_TIMEOUT_MS),
        .STEP_START_HZ(MOTOR_STEP_START_HZ),
        .STEP_MAX_HZ(MOTOR_STEP_MAX_HZ),
        .ACCEL_TIME_MS(MOTOR_ACCEL_TIME_MS),
        .STEP_PULSE_US(MOTOR_STEP_PULSE_US),
        .MOTOR_STEPS_PER_MM(MOTOR_STEPS_PER_MM),
        .ENCODER_TELEMETRY_ENABLE(1),
        .CLOSED_LOOP_ENABLE(MOTOR_CLOSED_LOOP_ENABLE),
        .CLOSED_LOOP_TOLERANCE_COUNTS(ENCODER_TOLERANCE_COUNTS),
        .ENCODER_COUNTS_PER_STEP_Q16(32'd20480),
        .ENCODER_REPORT_CYCLES(ENCODER_REPORT_CYCLES),
        .ENCODER_INVERT_X(ENCODER_INVERT_X),
        .ENCODER_INVERT_Y(ENCODER_INVERT_Y)
    ) u_motion (
        .sys_clk(sys_clk), .sys_rst_n(sys_rst_n),
        .uart_rxd(uart_rxd), .uart_txd(uart_txd),
        .start_button(start_button), .estop_button(estop_button),
        .limit_x(limit_x), .limit_y(limit_y),
        .encoder_x_a(encoder_x_a), .encoder_x_b(encoder_x_b),
        .encoder_y_a(encoder_y_a), .encoder_y_b(encoder_y_b),
        .needle_sensor(needle_sensor), .x_step(motion_x_step),
        .x_dir(motion_x_dir), .y_step(motion_y_step), .y_dir(motion_y_dir),
        .motor_en(motor_en), .needle_trig(needle_trig),
        .needle_sensor_debug(needle_sensor_debug), .led(led),
        .debug_state(unused_debug_state)
    );
endmodule
