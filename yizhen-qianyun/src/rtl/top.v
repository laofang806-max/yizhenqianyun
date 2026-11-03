// 达芬奇Pro刺绣控制顶层。无回零模式下，上电当前位置作为软件原点。
module top #(
    parameter RESET_HOLD_MS = 1500,
    parameter CLK_HZ = 50_000_000,
    parameter BAUD = 115200,
    parameter HOME_STEP_HZ = 500,
    parameter STEP_MAX_HZ = 4000,
    parameter STEP_START_HZ = 400,
    parameter ACCEL_TIME_MS = 250,
    parameter STEP_PULSE_US = 5,
    parameter BUTTON_DEBOUNCE_MS = 10,
    parameter LIMIT_DEBOUNCE_MS = 5,
    parameter HOME_DIR_X = 0,
    parameter HOME_DIR_Y = 0,
    parameter DIR_X_INVERT = 0,
    parameter DIR_Y_INVERT = 0,
    parameter LIMIT_ACTIVE_LOW = 0,
    parameter BUTTON_ACTIVE_LOW = 1,
    parameter EN_ACTIVE_LOW = 1,
    parameter WAIT_DELAY1_MS = 250,
    parameter NEEDLE_PULSE_MS = 500,
    parameter WAIT_DELAY2_MS = 250,
    parameter HOME_TIMEOUT_MS = 30000,
    parameter HOMING_ENABLE = 0,
    parameter MOTOR_STEPS_PER_MM = 800,
    parameter MAX_TRAVEL_MM = 300,
    parameter SOFT_LIMIT_ENABLE = 1,
    // Generic top defaults to legacy mode for existing timing-only testbenches.
    // Physical board_top explicitly enables verified IR feedback.
    parameter NEEDLE_FEEDBACK_ENABLE = 0,
    parameter NEEDLE_RETRY_WAIT_MS = 200,
    parameter NEEDLE_MAX_PULSES = 3,
    parameter NEEDLE_DOWN_TIMEOUT_MS = 1000,
    parameter NEEDLE_RETURN_TIMEOUT_MS = 2000,
    parameter NEEDLE_SENSOR_ACTIVE_LOW = 0,
    parameter NEEDLE_SENSOR_DEBOUNCE_MS = 5,
    parameter ENCODER_TELEMETRY_ENABLE = 0,
    parameter ENCODER_REPORT_CYCLES = CLK_HZ / 5,
    parameter ENCODER_FEEDBACK_ENABLE = 0,
    parameter CLOSED_LOOP_ENABLE = 0,
    parameter CLOSED_LOOP_TOLERANCE_COUNTS = 10,
    parameter ENCODER_COUNTS_PER_STEP_Q16 = 32'd65536,
    parameter ENCODER_STALL_THRESHOLD = 100,
    parameter ENCODER_INVERT_X = 0,
    parameter ENCODER_INVERT_Y = 0,
    parameter ENCODER_SETTLE_MS = 50
) (
    input sys_clk,
    input sys_rst_n,
    input uart_rxd,
    output uart_txd,
    input start_button,
    input estop_button,
    input limit_x,
    input limit_y,
    input encoder_x_a,
    input encoder_x_b,
    input encoder_y_a,
    input encoder_y_b,
    input needle_sensor,
    output reg x_step,
    output reg x_dir,
    output reg y_step,
    output reg y_dir,
    output motor_en,
    output needle_trig,
    output needle_sensor_debug,
    output reg [3:0] led,
    output reg [3:0] debug_state
);
    localparam ST_HOMING = 4'd0, ST_WAIT_COLOR = 4'd1, ST_RECEIVE = 4'd2,
               ST_WAIT_START = 4'd3, ST_STITCH_MOVE = 4'd4,
               ST_DELAY1 = 4'd5, ST_NEEDLE = 4'd6, ST_DELAY2 = 4'd7,
               ST_RETURN_HOME = 4'd8, ST_WAIT_CUT = 4'd9,
               ST_COMPLETE = 4'd10, ST_FAULT = 4'd11,
               ST_CAL_WAIT = 4'd12, ST_CAL_MOVE = 4'd13, ST_CAL_HOLD = 4'd14;
    localparam COLOR_BLACK = 3'd1, COLOR_RED = 3'd2,
               COLOR_YELLOW = 3'd3, COLOR_BLUE = 3'd4;
    localparam MSG_READY = 0, MSG_OK = 1, MSG_NEXT = 2, MSG_DONE = 3,
               MSG_ALL_DONE = 4, MSG_ESTOP = 5, MSG_PROTOCOL = 6,
               MSG_STALL = 7, MSG_BUSY = 8, MSG_HOME = 9, MSG_RANGE = 10, MSG_CORRECT = 11, MSG_FEEDBACK = 12, MSG_CAL_READY = 13, MSG_CAL_DONE = 14;
    localparam integer SOFT_LIMIT_STEPS =
        (MOTOR_STEPS_PER_MM * MAX_TRAVEL_MM) / 2;

    wire clk = sys_clk;
    wire line_valid,line_error;
    wire line_is_reset,line_is_capability,line_is_ping;
    wire [15:0] line_probe_id;
    reg [15:0] text_probe_id;
    reg [3:0] task_reset_count;
    reg [31:0] reset_hold_count;
    reg reset_hold_fired,reset_start_block;
    (* ASYNC_REG="TRUE" *) reg [1:0] reset_stop_sync;
    wire reset_stop_pressed = BUTTON_ACTIVE_LOW ? !reset_stop_sync[1] : reset_stop_sync[1];
    wire reset_start_released = BUTTON_ACTIVE_LOW ? start_button : !start_button;
    wire task_reset_request = line_valid && !line_error && line_is_reset;
    wire rst_n = sys_rst_n && task_reset_count==0;
    always @(posedge clk or negedge sys_rst_n) begin
      if(!sys_rst_n)begin
        task_reset_count<=0;reset_hold_count<=0;reset_hold_fired<=0;reset_start_block<=0;
        reset_stop_sync<=BUTTON_ACTIVE_LOW?2'b11:2'b00;
      end else begin
        reset_stop_sync<={reset_stop_sync[0],estop_button};
        if(task_reset_count!=0)task_reset_count<=task_reset_count-1'b1;
        if(!reset_stop_pressed)begin reset_hold_count<=0;reset_hold_fired<=0;end
        else if(!reset_hold_fired)begin
          if(reset_hold_count >= (CLK_HZ/1000)*RESET_HOLD_MS-1)begin
            task_reset_count<=15;reset_hold_fired<=1;reset_start_block<=1;
          end else reset_hold_count<=reset_hold_count+1'b1;
        end
        if(task_reset_request && task_reset_count==0)begin task_reset_count<=15;reset_start_block<=1;end
        else if(task_reset_count==0 && reset_start_released)reset_start_block<=0;
      end
    end
    wire [7:0] rx_data;
    wire rx_valid;
    wire line_is_calibration;
    wire line_is_color, line_is_status, line_action;
    wire [2:0] line_color;
    wire [12:0] line_count;
    wire signed [15:0] line_dx, line_dy;
    reg [3:0] state;
    reg [12:0] expected_points, received_points, stitch_index;
    reg [2:0] active_color, text_color;
    reg [1:0] colors_completed;
    reg [3:0] colors_received;
    reg waiting_motion, return_started, post_move_wait, estop_latched;
    reg [31:0] settle_count, pos_x, pos_y, move_dx, move_dy;
    reg signed [31:0] planned_x, planned_y;
    reg planned_range_error, record_loaded, record_fetch_pending;
    reg [63:0] home_timeout_count;
    reg move_start, position_clear, encoder_clear, encoder_enable;
    reg home_launch, homing_started, homing_wait_busy;
    reg [31:0] home_startup_count;
    reg text_request, fault_reported;
    reg [3:0] text_message;
    wire stitch_ram_write_enable = (state == ST_RECEIVE) && line_valid &&
        !line_error && !line_is_color && !line_is_status && !line_is_calibration &&
        received_points < expected_points;
    wire [11:0] stitch_ram_write_address = received_points[11:0];
    wire [32:0] stitch_ram_write_data = {line_action, line_dx, line_dy};
    wire stitch_ram_read_enable = (state == ST_STITCH_MOVE) &&
        !record_loaded && !record_fetch_pending && !waiting_motion &&
        !post_move_wait;
    wire [11:0] stitch_ram_read_address = stitch_index[11:0];
    wire [32:0] stitch_ram_read_data;
    wire tx_busy, text_busy, tx_start;
    wire [7:0] tx_byte;
    wire line_color_is_valid = (line_color == COLOR_RED) ||
                               (line_color == COLOR_BLUE) ||
                               (line_color == COLOR_YELLOW) ||
                               (line_color == COLOR_BLACK) || (line_color == 5);
    wire line_color_already_received =
        (line_color == COLOR_BLACK && colors_received[0]) ||
        (line_color == COLOR_RED && colors_received[1]) ||
        (line_color == COLOR_YELLOW && colors_received[2]) ||
        (line_color == COLOR_BLUE && colors_received[3]);
    wire line_color_is_next = (line_color==5) || line_color == ({1'b0, colors_completed} + 3'd1);
    wire home_busy, home_done, home_x_step, home_y_step, home_x_dir, home_y_dir;
    wire motion_busy, motion_done, motion_step_x, motion_step_y;
    wire motion_event_x, motion_event_y, motion_dir_x, motion_dir_y;
    wire monitor_stall, needle_busy, needle_done, needle_out;
    wire needle_active;
    wire needle_fault;
    wire [2:0] needle_fault_code;
    reg needle_fault_latched;
    reg [31:0] needle_input_age;
    wire needle_input_valid = needle_input_age >= (CLK_HZ/1000)*NEEDLE_SENSOR_DEBOUNCE_MS+4;
    wire needle_safe = !NEEDLE_FEEDBACK_ENABLE || (needle_input_valid && !needle_active);
    wire needle_motion_violation = NEEDLE_FEEDBACK_ENABLE && !needle_safe &&
        (move_start || motion_busy || home_busy || home_launch);
    always @(posedge clk or negedge rst_n)
      if(!rst_n)needle_input_age<=0;
      else if(!needle_input_valid)needle_input_age<=needle_input_age+1'b1;
    wire feedback_fault,feedback_correcting;
    reg feedback_correcting_previous;
    always @(posedge clk or negedge rst_n)
      if(!rst_n)feedback_correcting_previous<=0;else feedback_correcting_previous<=feedback_correcting;
    wire [1:0] needle_phase;
    reg motion_done_pending, needle_done_pending;
    wire motion_complete = motion_done || motion_done_pending;
    wire needle_complete = needle_done || needle_done_pending;
    wire [31:0] unused_enc_x, unused_enc_y;
    wire [31:0] return_dx = ~pos_x + 1'b1;
    wire [31:0] return_dy = ~pos_y + 1'b1;
    wire signed [32:0] planned_target_x =
        $signed({planned_x[31], planned_x}) + {{17{line_dx[15]}}, line_dx};
    wire signed [32:0] planned_target_y =
        $signed({planned_y[31], planned_y}) + {{17{line_dy[15]}}, line_dy};
    wire signed [32:0] soft_limit_steps_signed = SOFT_LIMIT_STEPS;
    wire planned_target_out_of_range = SOFT_LIMIT_ENABLE &&
        (planned_target_x > soft_limit_steps_signed ||
         planned_target_x < -soft_limit_steps_signed ||
         planned_target_y > soft_limit_steps_signed ||
         planned_target_y < -soft_limit_steps_signed);
    reg [32:0] active_record;
    wire needle_start = (state == ST_DELAY1) && !needle_busy && !needle_complete && !needle_fault_latched;

    uart_rx #(.CLK_HZ(CLK_HZ), .BAUD(BAUD)) u_uart_rx (
        .clk(clk), .rst_n(rst_n), .rxd(uart_rxd), .data(rx_data), .valid(rx_valid)
    );
    uart_tx #(.CLK_HZ(CLK_HZ), .BAUD(BAUD)) u_uart_tx (
        .clk(clk), .rst_n(rst_n), .data(tx_byte), .start(tx_start),
        .txd(uart_txd), .busy(tx_busy)
    );
    protocol_parser u_protocol_parser (
        .clk(clk), .rst_n(rst_n), .rx_data(rx_data), .rx_valid(rx_valid),
        .line_valid(line_valid), .line_error(line_error), .is_color(line_is_color),
        .is_status(line_is_status), .is_calibration(line_is_calibration),
        .is_reset(line_is_reset),.is_capability(line_is_capability),.is_ping(line_is_ping),.probe_id(line_probe_id),
        .color(line_color), .point_count(line_count), .action_stitch(line_action),
        .dx(line_dx), .dy(line_dy)
    );

    wire start_active, estop_active, limit_x_active, limit_y_active;
    wire estop_raw_active = BUTTON_ACTIVE_LOW ? !estop_button : estop_button;
    wire motion_pause = estop_latched || estop_raw_active;
    wire start_pressed, estop_pressed;
    reg start_previous, estop_previous;
    wire start_edge = start_pressed && !start_previous && !reset_start_block;
    wire estop_edge = estop_pressed && !estop_previous;

    input_filter #(.CLK_HZ(CLK_HZ), .DEBOUNCE_MS(BUTTON_DEBOUNCE_MS), .ACTIVE_LOW(BUTTON_ACTIVE_LOW)) u_start_filter (
        .clk(clk), .rst_n(rst_n), .async_in(start_button), .active(start_active)
    );
    input_filter #(.CLK_HZ(CLK_HZ), .DEBOUNCE_MS(1), .ACTIVE_LOW(BUTTON_ACTIVE_LOW)) u_estop_filter (
        .clk(clk), .rst_n(rst_n), .async_in(estop_button), .active(estop_active)
    );
    input_filter #(.CLK_HZ(CLK_HZ), .DEBOUNCE_MS(LIMIT_DEBOUNCE_MS), .ACTIVE_LOW(LIMIT_ACTIVE_LOW)) u_limit_x_filter (
        .clk(clk), .rst_n(rst_n), .async_in(limit_x), .active(limit_x_active)
    );
    input_filter #(.CLK_HZ(CLK_HZ), .DEBOUNCE_MS(LIMIT_DEBOUNCE_MS), .ACTIVE_LOW(LIMIT_ACTIVE_LOW)) u_limit_y_filter (
        .clk(clk), .rst_n(rst_n), .async_in(limit_y), .active(limit_y_active)
    );
    input_filter #(.CLK_HZ(CLK_HZ), .DEBOUNCE_MS(NEEDLE_SENSOR_DEBOUNCE_MS),
                   .ACTIVE_LOW(NEEDLE_SENSOR_ACTIVE_LOW)) u_needle_filter (
        .clk(clk), .rst_n(rst_n), .async_in(needle_sensor), .active(needle_active)
    );
    assign needle_sensor_debug = needle_active;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            start_previous <= 1'b0;
            estop_previous <= 1'b0;
        end else begin
            start_previous <= start_active;
            estop_previous <= estop_active;
        end
    end
    assign start_pressed = start_active;
    assign estop_pressed = estop_active;

    // Completion is a one-clock event; preserve it if E-stop freezes the sequencer.
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            motion_done_pending <= 0;
            needle_done_pending <= 0;
        end else begin
            if (motion_done) motion_done_pending <= 1;
            if (needle_done) needle_done_pending <= 1;
            if (move_start || state == ST_FAULT ||
                (!motion_pause &&
                 ((state == ST_STITCH_MOVE && waiting_motion) ||
                  (state == ST_RETURN_HOME && return_started) ||
                  (state == ST_CAL_MOVE && waiting_motion))))
                motion_done_pending <= 0;
            if (needle_start || state == ST_FAULT ||
                (!motion_pause &&
                 (state == ST_DELAY1 || state == ST_NEEDLE || state == ST_DELAY2)))
                needle_done_pending <= 0;
        end
    end

    homing #(
        .CLK_HZ(CLK_HZ), .STEP_HZ(HOME_STEP_HZ), .PULSE_US(STEP_PULSE_US),
        .HOME_DIR_X(HOME_DIR_X), .HOME_DIR_Y(HOME_DIR_Y),
        .DIR_X_INVERT(DIR_X_INVERT), .DIR_Y_INVERT(DIR_Y_INVERT)
    ) u_homing (
        .clk(clk), .rst_n(rst_n), .start(home_launch),
        .pause(motion_pause), .limit_x(limit_x_active), .limit_y(limit_y_active),
        .busy(home_busy), .done(home_done), .step_x(home_x_step), .dir_x(home_x_dir),
        .step_y(home_y_step), .dir_y(home_y_dir)
    );

    (* ram_style = "block" *) reg [32:0] stitch_ram [0:4095];
    reg [32:0] stitch_ram_read_data_reg;
    assign stitch_ram_read_data = stitch_ram_read_data_reg;

    always @(posedge clk) begin
        if (stitch_ram_write_enable)
            stitch_ram[stitch_ram_write_address] <= stitch_ram_write_data;
        if (stitch_ram_read_enable)
            stitch_ram_read_data_reg <= stitch_ram[stitch_ram_read_address];
    end

    text_tx #(.TELEMETRY_ENABLE(ENCODER_TELEMETRY_ENABLE),
              .REPORT_CYCLES(ENCODER_REPORT_CYCLES)) u_text_tx (
        .clk(clk), .rst_n(rst_n), .request(text_request), .message(text_message),
        .color(text_color), .probe_id(text_probe_id), .encoder_x(unused_enc_x), .encoder_y(unused_enc_y),
        .uart_busy(tx_busy), .uart_start(tx_start),
        .uart_data(tx_byte), .busy(text_busy)
    );
    motion_feedback #(
        .CLK_HZ(CLK_HZ), .STEP_MAX_HZ(STEP_MAX_HZ), .STEP_START_HZ(STEP_START_HZ),
        .ACCEL_TIME_MS(ACCEL_TIME_MS), .PULSE_US(STEP_PULSE_US),
        .DIR_X_INVERT(DIR_X_INVERT), .DIR_Y_INVERT(DIR_Y_INVERT),
        .ENABLE(CLOSED_LOOP_ENABLE),.COUNTS_PER_STEP_Q16(ENCODER_COUNTS_PER_STEP_Q16),
        .TOLERANCE_COUNTS(CLOSED_LOOP_TOLERANCE_COUNTS),.MAX_CORRECTION_STEPS(MOTOR_STEPS_PER_MM/2)
    ) u_motion (
        .clk(clk), .rst_n(rst_n), .start(move_start), .pause(motion_pause),
        .cancel(state == ST_FAULT),.clear(position_clear),
        .encoder_x($signed(unused_enc_x)),.encoder_y($signed(unused_enc_y)),
        .fault(feedback_fault),.correcting(feedback_correcting), .dx($signed(move_dx)), .dy($signed(move_dy)),
        .busy(motion_busy), .done(motion_done), .step_x(motion_step_x),
        .step_y(motion_step_y), .step_event_x(motion_event_x),
        .step_event_y(motion_event_y), .dir_x(motion_dir_x), .dir_y(motion_dir_y)
    );
    encoder_monitor #(
        .COUNTS_PER_STEP_Q16(ENCODER_COUNTS_PER_STEP_Q16),
        .STALL_THRESHOLD(ENCODER_STALL_THRESHOLD),
        .INVERT_X(ENCODER_INVERT_X), .INVERT_Y(ENCODER_INVERT_Y)
    ) u_encoder_monitor (
        .clk(clk), .rst_n(rst_n), .clear(encoder_clear && !ENCODER_TELEMETRY_ENABLE),
        .enable(ENCODER_TELEMETRY_ENABLE || CLOSED_LOOP_ENABLE || (ENCODER_FEEDBACK_ENABLE && encoder_enable)),
        .step_x(motion_event_x), .step_y(motion_event_y),
        .dir_x_positive(!(motion_dir_x ^ DIR_X_INVERT)),
        .dir_y_positive(!(motion_dir_y ^ DIR_Y_INVERT)),
        .enc_x_a(encoder_x_a), .enc_x_b(encoder_x_b),
        .enc_y_a(encoder_y_a), .enc_y_b(encoder_y_b),
        .stall(monitor_stall), .count_x(unused_enc_x), .count_y(unused_enc_y)
    );
    needle_ctrl #(
        .CLK_HZ(CLK_HZ), .WAIT_DELAY1_MS(WAIT_DELAY1_MS),
        .PULSE_MS(NEEDLE_PULSE_MS), .WAIT_DELAY2_MS(WAIT_DELAY2_MS),
        .FEEDBACK_ENABLE(NEEDLE_FEEDBACK_ENABLE),
        .RETRY_WAIT_MS(NEEDLE_RETRY_WAIT_MS),.MAX_PULSES(NEEDLE_MAX_PULSES),
        .DOWN_TIMEOUT_MS(NEEDLE_DOWN_TIMEOUT_MS),.RETURN_TIMEOUT_MS(NEEDLE_RETURN_TIMEOUT_MS)
    ) u_needle_ctrl (
        .clk(clk), .rst_n(rst_n), .start(needle_start), .pause(motion_pause),
        .cancel(state==ST_FAULT), .sensor_down(needle_active),
        .fault(needle_fault),.fault_code(needle_fault_code),
        .busy(needle_busy), .done(needle_done), .needle_trig(needle_out),
        .phase(needle_phase)
    );
    assign needle_trig = needle_out && !motion_pause && !needle_fault && !needle_fault_latched && state!=ST_FAULT;
    assign motor_en = EN_ACTIVE_LOW ? !rst_n : rst_n;

    always @* begin
        x_step = 1'b0;
        y_step = 1'b0;
        x_dir = 1'b0;
        y_dir = 1'b0;
        if (state == ST_HOMING) begin
            x_step = home_x_step && !motion_pause && needle_safe && !needle_fault_latched;
            y_step = home_y_step && !motion_pause && needle_safe && !needle_fault_latched;
            x_dir = home_x_dir;
            y_dir = home_y_dir;
        end else begin
            x_step = motion_step_x && !motion_pause && state != ST_FAULT && needle_safe && !needle_fault_latched;
            y_step = motion_step_y && !motion_pause && state != ST_FAULT && needle_safe && !needle_fault_latched;
            x_dir = motion_dir_x;
            y_dir = motion_dir_y;
        end
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_HOMING;
            debug_state <= ST_HOMING;
            expected_points <= 0;
            received_points <= 0;
            stitch_index <= 0;
            active_color <= COLOR_BLACK;
            colors_completed <= 0;
            colors_received <= 4'b0000;
            waiting_motion <= 0;
            return_started <= 0;
            post_move_wait <= 0;
            estop_latched <= 1'b0;
            settle_count <= 0;
            pos_x <= 0;
            pos_y <= 0;
            planned_x <= 0;
            planned_y <= 0;
            planned_range_error <= 1'b0;
            move_dx <= 0;
            move_dy <= 0;
            active_record <= 0;
            record_loaded <= 0;
            record_fetch_pending <= 0;
            move_start <= 0;
            home_launch <= 1'b0;
            homing_started <= 1'b0;
            homing_wait_busy <= 1'b0;
            home_startup_count <= 0;
            home_timeout_count <= 0;
            position_clear <= 0;
            encoder_clear <= 0;
            encoder_enable <= 0;
            text_request <= 0;
            text_probe_id<=0;
            text_message <= MSG_READY;
            text_color <= COLOR_BLACK;
            fault_reported <= 0;
            needle_fault_latched <= 0;
        end else begin
            debug_state <= state;
            // Keep an unaccepted launch until the paused motion engine can take it.
            move_start <= move_start && motion_pause;
            home_launch <= 1'b0;
            position_clear <= 1'b0;
            encoder_clear <= 1'b0;
            text_request <= 1'b0;
            if (position_clear) begin
                pos_x <= 0;
                pos_y <= 0;
            end else if (motion_event_x) begin
                pos_x <= (motion_dir_x ^ DIR_X_INVERT) ? pos_x - 1'b1 : pos_x + 1'b1;
            end
            if (!position_clear && motion_event_y) begin
                pos_y <= (motion_dir_y ^ DIR_Y_INVERT) ? pos_y - 1'b1 : pos_y + 1'b1;
            end

            if(line_valid && !line_error && (line_is_capability || line_is_ping))begin
                text_request<=1; text_message<=15;
                text_color<=line_is_ping?7:0; text_probe_id<=line_probe_id;
            end
            if (estop_edge) begin
                text_request <= 1'b1;
                text_message <= MSG_ESTOP;
                text_color <= active_color;
            end
            if (estop_raw_active) estop_latched <= 1'b1;
            else if (estop_latched && start_edge) estop_latched <= 1'b0;
            if(feedback_correcting && !feedback_correcting_previous)begin
                text_request<=1; text_message<=MSG_CORRECT; text_color<=active_color;
            end
            if (NEEDLE_FEEDBACK_ENABLE && (needle_fault || needle_motion_violation) && state!=ST_FAULT) begin
                needle_fault_latched<=1;state<=ST_FAULT;encoder_enable<=0;
                waiting_motion<=0;move_start<=0;home_launch<=0;
                text_request<=0;text_message<=MSG_BUSY;text_color<=active_color;fault_reported<=1;
            end else if (((ENCODER_FEEDBACK_ENABLE && monitor_stall) || (CLOSED_LOOP_ENABLE && feedback_fault)) &&
                state != ST_FAULT && state != ST_HOMING) begin
                state <= ST_FAULT;
                encoder_enable <= 1'b0;
                waiting_motion <= 1'b0;
                if (!fault_reported) begin
                    text_request <= 1'b1;
                    text_message <= feedback_fault ? MSG_FEEDBACK : MSG_STALL;
                    text_color <= active_color;
                    fault_reported <= 1'b1;
                end
            end else if (!estop_raw_active && !estop_latched) begin
                if (line_valid && line_is_status) begin
                    text_request <= 1'b1;
                    text_message <= (state == ST_WAIT_COLOR) ? MSG_READY :
                                    (state == ST_COMPLETE) ? MSG_ALL_DONE :
                                    (state == ST_CAL_WAIT) ? MSG_CAL_READY :
                                    (state == ST_CAL_HOLD) ? MSG_CAL_DONE :
                                    (state == ST_FAULT) ? MSG_FEEDBACK : MSG_BUSY;
                    text_color <= active_color;
                    if(state==ST_FAULT && needle_fault_latched)text_message<=MSG_BUSY;
                end
                // Status queries are observational: never stall motion/needle transitions.
                if (line_valid && !line_error && line_is_calibration) begin
                    // Arming never starts motion. Reset is required to leave calibration hold.
                    text_request <= 1;
                    if (state == ST_WAIT_COLOR) begin
                        if (SOFT_LIMIT_ENABLE &&
                            ($signed({pos_x[31],pos_x}) + 2*MOTOR_STEPS_PER_MM > soft_limit_steps_signed)) begin
                            text_message <= MSG_RANGE;
                        end else begin
                            state <= ST_CAL_WAIT;
                            text_message <= MSG_CAL_READY;
                        end
                    end else if (state == ST_CAL_WAIT) text_message <= MSG_CAL_READY;
                    else if (state == ST_CAL_HOLD) text_message <= MSG_CAL_DONE;
                    else text_message <= MSG_BUSY;
                end else case (state)
                    ST_CAL_WAIT: begin
                        if (start_edge) begin
                            move_dx <= 2*MOTOR_STEPS_PER_MM;
                            move_dy <= 0;
                            encoder_enable <= 1;
                            move_start <= 1;
                            waiting_motion <= 1;
                            state <= ST_CAL_MOVE;
                        end
                    end
                    ST_CAL_MOVE: begin
                        if (motion_complete && waiting_motion) begin
                            waiting_motion <= 0;
                            encoder_enable <= 0;
                            state <= ST_CAL_HOLD;
                            text_request <= 1;
                            text_message <= MSG_CAL_DONE;
                        end
                    end
                    ST_CAL_HOLD: begin
                        // No needle, repeat launch, or automatic return. Hold until reset.
                        state <= ST_CAL_HOLD;
                    end
                    ST_HOMING: begin
                        if (!HOMING_ENABLE) begin
                            position_clear <= 1'b1;
                            encoder_clear <= 1'b1;
                            state <= ST_WAIT_COLOR;
                            text_request <= 1'b1;
                            text_message <= MSG_READY;
                            text_color <= COLOR_BLACK;
                        end else if (!homing_started) begin
                            if (home_startup_count >= (CLK_HZ / 1000) * LIMIT_DEBOUNCE_MS) begin
                                home_launch <= 1'b1;
                                homing_started <= 1'b1;
                                homing_wait_busy <= 1'b1;
                            end else home_startup_count <= home_startup_count + 1'b1;
                        end else if (homing_wait_busy) begin
                            if (home_busy) homing_wait_busy <= 1'b0;
                        end else if (home_done) begin
                            home_timeout_count <= 0;
                            position_clear <= 1'b1;
                            encoder_clear <= 1'b1;
                            state <= ST_WAIT_COLOR;
                            text_request <= 1'b1;
                            text_message <= MSG_READY;
                            text_color <= COLOR_BLACK;
                        end else if (home_timeout_count >=
                                     ((CLK_HZ / 1000) * HOME_TIMEOUT_MS)) begin
                            state <= ST_FAULT;
                            text_request <= 1'b1;
                            text_message <= MSG_HOME;
                            fault_reported <= 1'b1;
                        end else begin
                            home_timeout_count <= home_timeout_count + 1'b1;
                        end
                    end
                    ST_WAIT_COLOR: begin
                        if (line_valid && !line_is_status && !line_is_capability && !line_is_ping && !line_is_reset) begin
                            if (!line_error && line_is_color &&
                                line_count <= 13'd4096 &&
                                line_color_is_valid &&
                                line_color_is_next &&
                                !line_color_already_received) begin
                                active_color <= line_color;
                                expected_points <= line_count;
                                received_points <= 0;
                                planned_x <= 0;
                                planned_y <= 0;
                                planned_range_error <= 1'b0;
                                if (line_count == 0) begin
                                    state <= ST_WAIT_START;
                                    stitch_index <= 0;
                                    record_loaded <= 1'b0;
                                    record_fetch_pending <= 1'b0;
                                    text_request <= 1'b1;
                                    text_message <= MSG_OK;
                                    text_color <= line_color;
                                end else state <= ST_RECEIVE;
                            end else begin
                                text_request <= 1'b1;
                                text_message <= MSG_PROTOCOL;
                            end
                        end
                    end
                    ST_RECEIVE: begin
                        if (line_valid && !line_is_status && !line_is_capability && !line_is_ping && !line_is_reset) begin
                            if (line_error || line_is_color || received_points >= expected_points) begin
                                state <= ST_WAIT_COLOR;
                                text_request <= 1'b1;
                                text_message <= MSG_PROTOCOL;
                            end else begin
                                planned_x <= planned_target_x[31:0];
                                planned_y <= planned_target_y[31:0];
                                if (planned_target_out_of_range)
                                    planned_range_error <= 1'b1;
                                if (received_points + 1'b1 == expected_points) begin
                                    received_points <= received_points + 1'b1;
                                    text_request <= 1'b1;
                                    if (planned_range_error || planned_target_out_of_range) begin
                                        state <= ST_WAIT_COLOR;
                                        expected_points <= 0;
                                        received_points <= 0;
                                        text_message <= MSG_RANGE;
                                    end else begin
                                        stitch_index <= 0;
                                        record_loaded <= 1'b0;
                                        record_fetch_pending <= 1'b0;
                                        state <= ST_WAIT_START;
                                        text_message <= MSG_OK;
                                        text_color <= active_color;
                                    end
                                end else begin
                                    received_points <= received_points + 1'b1;
                                end
                            end
                        end
                    end
                    ST_WAIT_START: begin
                        if (start_edge) begin
                            stitch_index <= 0;
                            record_loaded <= 1'b0;
                            record_fetch_pending <= 1'b0;
                            waiting_motion <= 1'b0;
                            if (expected_points == 0) begin
                                return_started <= 1'b0;
                                state <= ST_RETURN_HOME;
                            end else state <= ST_STITCH_MOVE;
                        end
                    end
                    ST_STITCH_MOVE: begin
                        if (motion_complete && waiting_motion) begin
                            waiting_motion <= 1'b0;
                            post_move_wait <= 1'b1;
                            settle_count <= 0;
                        end else if (post_move_wait) begin
                            if (!ENCODER_FEEDBACK_ENABLE ||
                                settle_count >= (CLK_HZ / 1000) * ENCODER_SETTLE_MS) begin
                                post_move_wait <= 1'b0;
                                encoder_enable <= 1'b0;
                                if (active_record[32]) state <= ST_DELAY1;
                                else if (stitch_index + 1'b1 >= expected_points) begin
                                    state <= ST_RETURN_HOME;
                                    return_started <= 1'b0;
                                end else begin
                                    stitch_index <= stitch_index + 1'b1;
                                    record_loaded <= 1'b0;
                                    record_fetch_pending <= 1'b0;
                                end
                            end else settle_count <= settle_count + 1'b1;
                        end else if (!record_loaded) begin
                            if (record_fetch_pending) begin
                                active_record <= stitch_ram_read_data;
                                record_loaded <= 1'b1;
                                record_fetch_pending <= 1'b0;
                            end else begin
                                record_fetch_pending <= 1'b1;
                            end
                        end else if (!waiting_motion) begin
                            move_dx <= {{16{active_record[31]}}, active_record[31:16]};
                            move_dy <= {{16{active_record[15]}}, active_record[15:0]};
                            encoder_clear <= 1'b1;
                            encoder_enable <= 1'b1;
                            move_start <= 1'b1;
                            waiting_motion <= 1'b1;
                        end
                    end
                    ST_DELAY1: begin
                        if (needle_phase == 2'd2) state <= ST_NEEDLE;
                        else if (needle_phase == 2'd3) state <= ST_DELAY2;
                        if (needle_complete) begin
                            if (stitch_index + 1'b1 >= expected_points) begin
                                state <= ST_RETURN_HOME;
                                return_started <= 1'b0;
                            end else begin
                                stitch_index <= stitch_index + 1'b1;
                                record_loaded <= 1'b0;
                                record_fetch_pending <= 1'b0;
                                state <= ST_STITCH_MOVE;
                            end
                            text_request <= 1'b1;
                            text_message <= MSG_NEXT;
                        end
                    end
                    ST_NEEDLE: begin
                        if (needle_phase == 2'd3) state <= ST_DELAY2;
                        if (needle_complete) begin
                            if (stitch_index + 1'b1 >= expected_points) begin
                                state <= ST_RETURN_HOME;
                                return_started <= 1'b0;
                            end else begin
                                stitch_index <= stitch_index + 1'b1;
                                record_loaded <= 1'b0;
                                record_fetch_pending <= 1'b0;
                                state <= ST_STITCH_MOVE;
                            end
                            text_request <= 1'b1;
                            text_message <= MSG_NEXT;
                        end
                    end
                    ST_DELAY2: begin
                        if (needle_complete) begin
                            if (stitch_index + 1'b1 >= expected_points) begin
                                state <= ST_RETURN_HOME;
                                return_started <= 1'b0;
                            end else begin
                                stitch_index <= stitch_index + 1'b1;
                                record_loaded <= 1'b0;
                                record_fetch_pending <= 1'b0;
                                state <= ST_STITCH_MOVE;
                            end
                            text_request <= 1'b1;
                            text_message <= MSG_NEXT;
                        end
                    end
                    ST_RETURN_HOME: begin
                        if (motion_complete && return_started) begin
                            return_started <= 1'b0;
                            post_move_wait <= 1'b1;
                            settle_count <= 0;
                        end else if (post_move_wait) begin
                            if (!ENCODER_FEEDBACK_ENABLE ||
                                settle_count >= (CLK_HZ / 1000) * ENCODER_SETTLE_MS) begin
                                post_move_wait <= 1'b0;
                                encoder_enable <= 1'b0;
                                if(active_color!=5)colors_received[active_color - 1'b1] <= 1'b1;
                                if (active_color!=5 && colors_completed == 3) begin
                                    state <= ST_COMPLETE;
                                    text_request <= 1'b1;
                                    text_message <= MSG_ALL_DONE;
                                end else begin
                                    state <= ST_WAIT_CUT;
                                    text_request <= 1'b1;
                                    text_message <= MSG_DONE;
                                    text_color <= active_color;
                                end
                            end else settle_count <= settle_count + 1'b1;
                        end else if (!return_started) begin
                            move_dx <= return_dx;
                            move_dy <= return_dy;
                            encoder_clear <= 1'b1;
                            encoder_enable <= 1'b1;
                            move_start <= 1'b1;
                            return_started <= 1'b1;
                        end
                    end
                    ST_WAIT_CUT: begin
                        if (start_edge) begin
                            if(active_color!=5)colors_completed <= colors_completed + 1'b1;
                            expected_points <= 0;
                            received_points <= 0;
                            state <= ST_WAIT_COLOR;
                            text_request <= 1'b1;
                            text_message <= MSG_READY;
                            text_color <= active_color;
                        end
                    end
                    ST_COMPLETE: begin
                        state <= ST_COMPLETE;
                    end
                    ST_FAULT: begin
                        if (start_edge && !estop_active && !needle_fault_latched) begin
                            fault_reported <= 1'b0;
                            encoder_clear <= 1'b1;
                            if (HOMING_ENABLE) begin
                                state <= ST_HOMING;
                                home_launch <= 1'b1;
                                homing_started <= 1'b1;
                                homing_wait_busy <= 1'b1;
                                home_timeout_count <= 0;
                            end else begin
                                state <= ST_WAIT_COLOR;
                                position_clear <= 1'b1;
                                text_request <= 1'b1;
                                text_message <= MSG_READY;
                                text_color <= active_color;
                            end
                        end
                    end
                    default: state <= ST_HOMING;
                endcase
            end
        end
    end

    always @* begin
        if (state == ST_HOMING) led = 4'b0001;
        else if (state == ST_WAIT_COLOR || state == ST_WAIT_START || state == ST_CAL_WAIT) led = 4'b0010;
        else if (state == ST_CAL_MOVE || state == ST_STITCH_MOVE || state == ST_DELAY1 ||
                 state == ST_NEEDLE || state == ST_DELAY2) led = 4'b0100;
        else if (state == ST_WAIT_CUT) led = 4'b0011;
        else if (state == ST_FAULT) led = 4'b0111;
        else led = 4'b0000;
        // LED3 is dedicated to the stationary needle window, never task completion.
        led[3] = (state == ST_DELAY1 || state == ST_NEEDLE || state == ST_DELAY2)
                 && !motion_pause;
    end
endmodule

