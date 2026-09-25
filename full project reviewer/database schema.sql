-- ============================================================
-- Workforce Management System -- Full schema, ONE database ("workforce_mgnt")
-- Regenerated directly from the live PostgreSQL server (127.0.0.1:5432) after
-- the system was consolidated from 8 microservice databases into a single
-- Laravel monolith backend. Schema only (no data).
-- ============================================================
--
--
-- PostgreSQL database dump
--

\restrict D9Zas3wN7lgK5cvvyumwlJt6h6A1KVFXcWYAGmw5dgZ4UjJOHP8MVzeqcgwVVhz

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics (
    id bigint NOT NULL,
    attendance_trend json,
    department_productivity json,
    leave_trend json,
    overtime_summary json,
    punctuality_score json,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.analytics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: analytics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.analytics_id_seq OWNED BY public.analytics.id;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id character varying(255) NOT NULL,
    employee_id character varying(255) NOT NULL,
    date date NOT NULL,
    clock_in time(0) without time zone,
    clock_out time(0) without time zone,
    status character varying(255) NOT NULL,
    overtime numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    regular_hours numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    total_hours numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    break_hours numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    location character varying(255) DEFAULT 'Office'::character varying NOT NULL,
    notes text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    actual_clock_out time(0) without time zone
);


--
-- Name: attendance_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_adjustments (
    id character varying(255) NOT NULL,
    employee_id character varying(255) NOT NULL,
    employee_name character varying(255) NOT NULL,
    date date NOT NULL,
    type character varying(255) NOT NULL,
    claimed_time time(0) without time zone,
    reason text NOT NULL,
    proof json,
    shift_start time(0) without time zone,
    shift_end time(0) without time zone,
    derived_hours numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    derived_overtime numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    recorded_hours numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    status character varying(255) NOT NULL,
    decided_by character varying(255),
    decided_at timestamp(0) without time zone,
    decision_note text,
    requested_date date NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    final_time time(0) without time zone
);


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id bigint NOT NULL,
    service character varying(40) NOT NULL,
    event character varying(120) NOT NULL,
    entity_type character varying(40) NOT NULL,
    entity_id character varying(40),
    actor character varying(150),
    actor_id character varying(40),
    before json,
    after json,
    meta json,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_events_id_seq OWNED BY public.audit_events.id;


--
-- Name: cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cache (
    key character varying(255) NOT NULL,
    value text NOT NULL,
    expiration bigint NOT NULL
);


--
-- Name: cache_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cache_locks (
    key character varying(255) NOT NULL,
    owner character varying(255) NOT NULL,
    expiration bigint NOT NULL
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    head character varying(255),
    head_id character varying(255),
    employee_count integer DEFAULT 0 NOT NULL,
    budget numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    location character varying(255),
    description text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: early_clock_outs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.early_clock_outs (
    id character varying(255) NOT NULL,
    attendance_id character varying(255) NOT NULL,
    employee_id character varying(255) NOT NULL,
    employee_name character varying(255),
    date date NOT NULL,
    scheduled_end_time time(0) without time zone,
    actual_clock_out_time time(0) without time zone NOT NULL,
    minutes_early integer DEFAULT 0 NOT NULL,
    reason_code character varying(255),
    reason_note text,
    proof json,
    reason_status character varying(255) DEFAULT 'PENDING'::character varying NOT NULL,
    classification character varying(255) DEFAULT 'PENDING_REVIEW'::character varying NOT NULL,
    classified_by character varying(255),
    classified_at timestamp(0) without time zone,
    notification_sent boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    classification_note text,
    proof_due_at timestamp(0) without time zone
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id character varying(255) NOT NULL,
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(255),
    department character varying(255),
    "position" character varying(255),
    employment_type character varying(255) DEFAULT 'Full-time'::character varying NOT NULL,
    status character varying(255) DEFAULT 'Active'::character varying NOT NULL,
    hire_date date,
    manager character varying(255),
    avatar text,
    address text,
    date_of_birth date,
    gender character varying(255),
    blood_group character varying(255),
    emergency_contact character varying(255),
    emergency_phone character varying(255),
    skills json,
    education json,
    face_registered boolean DEFAULT false NOT NULL,
    face_image text,
    face_registered_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    leave_balances json,
    face_descriptor json
);


--
-- Name: failed_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.failed_jobs (
    id bigint NOT NULL,
    uuid character varying(255) NOT NULL,
    connection character varying(255) NOT NULL,
    queue character varying(255) NOT NULL,
    payload text NOT NULL,
    exception text NOT NULL,
    failed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: failed_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.failed_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: failed_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.failed_jobs_id_seq OWNED BY public.failed_jobs.id;


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holidays (
    id bigint NOT NULL,
    date date NOT NULL,
    name character varying(120) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: holidays_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.holidays_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: holidays_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.holidays_id_seq OWNED BY public.holidays.id;


--
-- Name: job_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_batches (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    total_jobs integer NOT NULL,
    pending_jobs integer NOT NULL,
    failed_jobs integer NOT NULL,
    failed_job_ids text NOT NULL,
    options text,
    cancelled_at integer,
    created_at integer NOT NULL,
    finished_at integer
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id bigint NOT NULL,
    queue character varying(255) NOT NULL,
    payload text NOT NULL,
    attempts smallint NOT NULL,
    reserved_at integer,
    available_at integer NOT NULL,
    created_at integer NOT NULL
);


--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: leaves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaves (
    id character varying(255) NOT NULL,
    employee_id character varying(255) NOT NULL,
    employee_name character varying(255) NOT NULL,
    leave_type character varying(255) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text NOT NULL,
    status character varying(255) NOT NULL,
    applied_date date NOT NULL,
    approved_by character varying(255),
    comments text,
    documents json,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    days numeric(5,1)
);


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    migration character varying(255) NOT NULL,
    batch integer NOT NULL
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    "timestamp" timestamp(0) without time zone NOT NULL,
    read boolean DEFAULT false NOT NULL,
    employee_id character varying(255),
    priority character varying(255) DEFAULT 'low'::character varying NOT NULL,
    action_url character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: overtime_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.overtime_requests (
    id character varying(255) NOT NULL,
    employee_id character varying(255) NOT NULL,
    employee_name character varying(255) NOT NULL,
    date date NOT NULL,
    expected_hours numeric(5,2),
    reason text NOT NULL,
    status character varying(255) NOT NULL,
    requested_date date NOT NULL,
    approved_by character varying(255),
    comments text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    approved_hours numeric(5,2),
    approved_at timestamp(0) without time zone
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    email character varying(255) NOT NULL,
    token character varying(255) NOT NULL,
    created_at timestamp(0) without time zone
);


--
-- Name: personal_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personal_access_tokens (
    id bigint NOT NULL,
    tokenable_type character varying(255) NOT NULL,
    tokenable_id bigint NOT NULL,
    name text NOT NULL,
    token character varying(64) NOT NULL,
    abilities text,
    last_used_at timestamp(0) without time zone,
    expires_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: personal_access_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.personal_access_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: personal_access_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.personal_access_tokens_id_seq OWNED BY public.personal_access_tokens.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id character varying(255) NOT NULL,
    department_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: schedule_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_settings (
    id smallint NOT NULL,
    default_work_days json,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    max_weekly_hours smallint DEFAULT '48'::smallint NOT NULL
);


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_events (
    id character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    message character varying(255) NOT NULL,
    detail json,
    employee_id character varying(255),
    status character varying(255) DEFAULT 'Open'::character varying NOT NULL,
    resolved_at timestamp(0) without time zone,
    resolved_by character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id character varying(255) NOT NULL,
    user_id bigint,
    ip_address character varying(45),
    user_agent text,
    payload text NOT NULL,
    last_activity integer NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id bigint NOT NULL,
    profile json,
    appearance json,
    notifications json,
    security json,
    system json,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    company json,
    kiosk json,
    ai_resolved_insights json
);


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: shift_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_definitions (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    start_time time(0) without time zone NOT NULL,
    end_time time(0) without time zone NOT NULL,
    color character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: shift_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_schedules (
    id character varying(255) NOT NULL,
    employee_id character varying(255) NOT NULL,
    employee_name character varying(255) NOT NULL,
    shift_id character varying(255) NOT NULL,
    date date NOT NULL,
    status character varying(255) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: timesheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheets (
    id character varying(255) NOT NULL,
    employee_id character varying(255) NOT NULL,
    employee_name character varying(255) NOT NULL,
    department character varying(255) NOT NULL,
    date date NOT NULL,
    week_start date NOT NULL,
    week_end date NOT NULL,
    regular_hours numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    overtime_hours numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    break_hours numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    total_hours numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    status character varying(255) NOT NULL,
    submitted_date date,
    approved_by character varying(255),
    notes text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    approved_ot_hours numeric(5,2),
    paid_ot_hours numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    submitted_at timestamp(0) without time zone,
    submitted_by character varying(150),
    auto_submitted boolean DEFAULT false NOT NULL,
    reviewed_at timestamp(0) without time zone,
    status_reason text,
    needs_refresh boolean DEFAULT false NOT NULL,
    reminded_at timestamp(0) without time zone,
    nudged_at timestamp(0) without time zone,
    exported_at timestamp(0) without time zone,
    history json
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    employee_id character varying(255),
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    email_verified_at timestamp(0) without time zone,
    password character varying(255) NOT NULL,
    role character varying(255) DEFAULT 'Employee'::character varying NOT NULL,
    role_label character varying(255),
    avatar_seed character varying(255),
    remember_token character varying(100),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: analytics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics ALTER COLUMN id SET DEFAULT nextval('public.analytics_id_seq'::regclass);


--
-- Name: audit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);


--
-- Name: failed_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_jobs ALTER COLUMN id SET DEFAULT nextval('public.failed_jobs_id_seq'::regclass);


--
-- Name: holidays id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays ALTER COLUMN id SET DEFAULT nextval('public.holidays_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: personal_access_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_tokens ALTER COLUMN id SET DEFAULT nextval('public.personal_access_tokens_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: analytics analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics
    ADD CONSTRAINT analytics_pkey PRIMARY KEY (id);


--
-- Name: attendance_adjustments attendance_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_adjustments
    ADD CONSTRAINT attendance_adjustments_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_employee_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_employee_date_unique UNIQUE (employee_id, date);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: cache_locks cache_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cache_locks
    ADD CONSTRAINT cache_locks_pkey PRIMARY KEY (key);


--
-- Name: cache cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cache
    ADD CONSTRAINT cache_pkey PRIMARY KEY (key);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: early_clock_outs early_clock_outs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.early_clock_outs
    ADD CONSTRAINT early_clock_outs_pkey PRIMARY KEY (id);


--
-- Name: employees employees_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_email_unique UNIQUE (email);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: failed_jobs failed_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_jobs
    ADD CONSTRAINT failed_jobs_pkey PRIMARY KEY (id);


--
-- Name: failed_jobs failed_jobs_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_jobs
    ADD CONSTRAINT failed_jobs_uuid_unique UNIQUE (uuid);


--
-- Name: holidays holidays_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_date_unique UNIQUE (date);


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);


--
-- Name: job_batches job_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_batches
    ADD CONSTRAINT job_batches_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: leaves leaves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaves
    ADD CONSTRAINT leaves_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: overtime_requests overtime_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overtime_requests
    ADD CONSTRAINT overtime_requests_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (email);


--
-- Name: personal_access_tokens personal_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_pkey PRIMARY KEY (id);


--
-- Name: personal_access_tokens personal_access_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_token_unique UNIQUE (token);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schedule_settings schedule_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_settings
    ADD CONSTRAINT schedule_settings_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: shift_definitions shift_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_definitions
    ADD CONSTRAINT shift_definitions_pkey PRIMARY KEY (id);


--
-- Name: shift_schedules shift_schedules_employee_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_schedules
    ADD CONSTRAINT shift_schedules_employee_date_unique UNIQUE (employee_id, date);


--
-- Name: shift_schedules shift_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_schedules
    ADD CONSTRAINT shift_schedules_pkey PRIMARY KEY (id);


--
-- Name: timesheets timesheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: attendance_adjustments_employee_id_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_adjustments_employee_id_date_index ON public.attendance_adjustments USING btree (employee_id, date);


--
-- Name: attendance_adjustments_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_adjustments_employee_id_index ON public.attendance_adjustments USING btree (employee_id);


--
-- Name: attendance_adjustments_status_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_adjustments_status_type_index ON public.attendance_adjustments USING btree (status, type);


--
-- Name: attendance_employee_id_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_employee_id_date_index ON public.attendance USING btree (employee_id, date);


--
-- Name: attendance_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_employee_id_index ON public.attendance USING btree (employee_id);


--
-- Name: audit_events_entity_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_entity_id_index ON public.audit_events USING btree (entity_id);


--
-- Name: audit_events_entity_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_entity_type_index ON public.audit_events USING btree (entity_type);


--
-- Name: audit_events_event_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_event_index ON public.audit_events USING btree (event);


--
-- Name: audit_events_service_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_service_index ON public.audit_events USING btree (service);


--
-- Name: cache_expiration_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cache_expiration_index ON public.cache USING btree (expiration);


--
-- Name: cache_locks_expiration_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cache_locks_expiration_index ON public.cache_locks USING btree (expiration);


--
-- Name: early_clock_outs_attendance_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX early_clock_outs_attendance_id_index ON public.early_clock_outs USING btree (attendance_id);


--
-- Name: early_clock_outs_employee_id_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX early_clock_outs_employee_id_date_index ON public.early_clock_outs USING btree (employee_id, date);


--
-- Name: early_clock_outs_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX early_clock_outs_employee_id_index ON public.early_clock_outs USING btree (employee_id);


--
-- Name: failed_jobs_connection_queue_failed_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX failed_jobs_connection_queue_failed_at_index ON public.failed_jobs USING btree (connection, queue, failed_at);


--
-- Name: jobs_queue_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_queue_index ON public.jobs USING btree (queue);


--
-- Name: leaves_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leaves_employee_id_index ON public.leaves USING btree (employee_id);


--
-- Name: notifications_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_employee_id_index ON public.notifications USING btree (employee_id);


--
-- Name: overtime_requests_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX overtime_requests_employee_id_index ON public.overtime_requests USING btree (employee_id);


--
-- Name: personal_access_tokens_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX personal_access_tokens_expires_at_index ON public.personal_access_tokens USING btree (expires_at);


--
-- Name: personal_access_tokens_tokenable_type_tokenable_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX personal_access_tokens_tokenable_type_tokenable_id_index ON public.personal_access_tokens USING btree (tokenable_type, tokenable_id);


--
-- Name: security_events_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX security_events_employee_id_index ON public.security_events USING btree (employee_id);


--
-- Name: sessions_last_activity_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_last_activity_index ON public.sessions USING btree (last_activity);


--
-- Name: sessions_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_index ON public.sessions USING btree (user_id);


--
-- Name: shift_schedules_employee_id_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_schedules_employee_id_date_index ON public.shift_schedules USING btree (employee_id, date);


--
-- Name: shift_schedules_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_schedules_employee_id_index ON public.shift_schedules USING btree (employee_id);


--
-- Name: shift_schedules_shift_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_schedules_shift_id_index ON public.shift_schedules USING btree (shift_id);


--
-- Name: timesheets_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timesheets_employee_id_index ON public.timesheets USING btree (employee_id);


--
-- Name: users_employee_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_employee_id_index ON public.users USING btree (employee_id);


--
-- Name: roles roles_department_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_department_id_foreign FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict D9Zas3wN7lgK5cvvyumwlJt6h6A1KVFXcWYAGmw5dgZ4UjJOHP8MVzeqcgwVVhz

