--
-- PostgreSQL database dump
--

\restrict TDvoQhpi4SXMVyN3FKyrfs7T9G7EUU6QXDioN0iCTjxhV5yej0ByYWSOUR1A1HI

-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

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
-- Name: account_deletion_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_deletion_requests (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    reason character varying(500),
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    scheduled_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT account_deletion_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: account_deletion_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.account_deletion_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: account_deletion_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.account_deletion_requests_id_seq OWNED BY public.account_deletion_requests.id;


--
-- Name: admin_action_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_action_logs (
    id bigint NOT NULL,
    admin_id bigint NOT NULL,
    action character varying(100) NOT NULL,
    category character varying(50) NOT NULL,
    target_type character varying(50),
    target_id bigint,
    description text,
    metadata json,
    ip_address character varying(45),
    severity character varying(20) DEFAULT 'info'::character varying NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: admin_action_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_action_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_action_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_action_logs_id_seq OWNED BY public.admin_action_logs.id;


--
-- Name: admin_coin_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_coin_settings (
    id bigint NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: admin_coin_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_coin_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_coin_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_coin_settings_id_seq OWNED BY public.admin_coin_settings.id;


--
-- Name: admin_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_commissions (
    id bigint NOT NULL,
    source_type character varying(50) DEFAULT 'gift'::character varying NOT NULL,
    source_id bigint NOT NULL,
    user_id bigint NOT NULL,
    gross_coins bigint NOT NULL,
    commission_rate numeric(5,2) DEFAULT '30'::numeric NOT NULL,
    commission_coins bigint NOT NULL,
    commission_value_usd numeric(10,2) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: admin_commissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_commissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_commissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_commissions_id_seq OWNED BY public.admin_commissions.id;


--
-- Name: admin_user_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_user_notes (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    admin_id bigint NOT NULL,
    note text NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: admin_user_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_user_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_user_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_user_notes_id_seq OWNED BY public.admin_user_notes.id;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id bigint NOT NULL,
    key character varying(100) NOT NULL,
    value text,
    type character varying(20) DEFAULT 'string'::character varying NOT NULL,
    "group" character varying(50) DEFAULT 'general'::character varying NOT NULL,
    description character varying(255),
    is_public boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;


--
-- Name: audio_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_favorites (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    audio_track_id bigint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: audio_favorites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audio_favorites_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audio_favorites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audio_favorites_id_seq OWNED BY public.audio_favorites.id;


--
-- Name: audio_tracks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_tracks (
    id bigint NOT NULL,
    title character varying(255) NOT NULL,
    artist character varying(255),
    cover_url character varying(500),
    audio_url character varying(500) NOT NULL,
    duration smallint,
    usage_count integer DEFAULT 0 NOT NULL,
    is_original boolean DEFAULT false NOT NULL,
    user_id bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    mood character varying(50),
    genre character varying(50),
    usage_rights character varying(50) DEFAULT 'attribution_required'::character varying
);


--
-- Name: audio_tracks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audio_tracks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audio_tracks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audio_tracks_id_seq OWNED BY public.audio_tracks.id;


--
-- Name: blocked_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_users (
    id bigint NOT NULL,
    blocker_id bigint NOT NULL,
    blocked_id bigint NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: blocked_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blocked_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blocked_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blocked_users_id_seq OWNED BY public.blocked_users.id;


--
-- Name: cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cache (
    key character varying(255) NOT NULL,
    value text NOT NULL,
    expiration integer NOT NULL
);


--
-- Name: cache_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cache_locks (
    key character varying(255) NOT NULL,
    owner character varying(255) NOT NULL,
    expiration integer NOT NULL
);


--
-- Name: cms_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_pages (
    id bigint NOT NULL,
    slug character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    content text,
    meta_title character varying(255),
    meta_description character varying(255),
    is_published boolean DEFAULT true NOT NULL,
    locale character varying(10) DEFAULT 'en'::character varying NOT NULL,
    updated_by bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: cms_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cms_pages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cms_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cms_pages_id_seq OWNED BY public.cms_pages.id;


--
-- Name: coin_gifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coin_gifts (
    id bigint NOT NULL,
    sender_id bigint NOT NULL,
    receiver_id bigint NOT NULL,
    video_id bigint,
    live_id bigint,
    gift_name character varying(100) DEFAULT 'Gift'::character varying NOT NULL,
    gross_coins bigint NOT NULL,
    commission_rate numeric(5,2) DEFAULT '30'::numeric NOT NULL,
    commission_coins bigint NOT NULL,
    net_coins bigint NOT NULL,
    gross_value_usd numeric(10,2) NOT NULL,
    net_value_usd numeric(10,2) NOT NULL,
    platform_revenue_usd numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    reference_id character varying(100),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: coin_gifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coin_gifts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coin_gifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coin_gifts_id_seq OWNED BY public.coin_gifts.id;


--
-- Name: coin_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coin_orders (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    package_id bigint NOT NULL,
    coins bigint NOT NULL,
    price_usd numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    payment_method character varying(50) NOT NULL,
    payment_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    payment_reference character varying(255),
    payment_meta json,
    paid_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: coin_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coin_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coin_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coin_orders_id_seq OWNED BY public.coin_orders.id;


--
-- Name: coin_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coin_packages (
    id bigint NOT NULL,
    plan_name character varying(100) NOT NULL,
    coins bigint NOT NULL,
    price_usd numeric(10,2) NOT NULL,
    badge character varying(50),
    icon character varying(100),
    is_front_visible boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: coin_packages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coin_packages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coin_packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coin_packages_id_seq OWNED BY public.coin_packages.id;


--
-- Name: comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_likes (
    id bigint NOT NULL,
    comment_id bigint NOT NULL,
    user_id bigint NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: comment_likes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comment_likes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comment_likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comment_likes_id_seq OWNED BY public.comment_likes.id;


--
-- Name: comment_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_mentions (
    id bigint NOT NULL,
    mentioned_user_id bigint NOT NULL,
    mentioned_by_user_id bigint NOT NULL,
    source_type character varying(20) NOT NULL,
    source_id bigint NOT NULL,
    video_id bigint,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: comment_mentions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comment_mentions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comment_mentions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comment_mentions_id_seq OWNED BY public.comment_mentions.id;


--
-- Name: comment_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_reactions (
    id bigint NOT NULL,
    comment_id bigint NOT NULL,
    user_id bigint NOT NULL,
    reaction_type character varying(255) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT comment_reactions_reaction_type_check CHECK (((reaction_type)::text = ANY ((ARRAY['love'::character varying, 'dislike'::character varying])::text[])))
);


--
-- Name: comment_reactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comment_reactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comment_reactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comment_reactions_id_seq OWNED BY public.comment_reactions.id;


--
-- Name: comment_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_reports (
    id bigint NOT NULL,
    comment_id bigint NOT NULL,
    video_id bigint NOT NULL,
    reporter_user_id bigint NOT NULL,
    comment_owner_id bigint NOT NULL,
    reason character varying(255) NOT NULL,
    details text,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_at timestamp(0) without time zone,
    reviewed_by bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT comment_reports_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'reviewed'::character varying, 'resolved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: comment_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comment_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comment_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comment_reports_id_seq OWNED BY public.comment_reports.id;


--
-- Name: comment_restricted_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_restricted_users (
    id bigint NOT NULL,
    creator_id bigint NOT NULL,
    user_id bigint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: comment_restricted_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comment_restricted_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comment_restricted_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comment_restricted_users_id_seq OWNED BY public.comment_restricted_users.id;


--
-- Name: conversation_admin_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_admin_logs (
    id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    admin_id bigint,
    action character varying(60) NOT NULL,
    actor_label character varying(100),
    metadata json,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: conversation_admin_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_admin_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_admin_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_admin_logs_id_seq OWNED BY public.conversation_admin_logs.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id bigint NOT NULL,
    user_a_id bigint NOT NULL,
    user_b_id bigint NOT NULL,
    initiated_by bigint NOT NULL,
    received_by bigint NOT NULL,
    status character varying(255) DEFAULT 'approved'::character varying NOT NULL,
    approved_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    flagged_at timestamp(0) without time zone,
    report_status character varying(20),
    risk_level character varying(10),
    shadow_restricted boolean DEFAULT false NOT NULL,
    dm_restricted boolean DEFAULT false NOT NULL,
    message_approval_required boolean DEFAULT false NOT NULL,
    links_disabled boolean DEFAULT false NOT NULL,
    media_restricted boolean DEFAULT false NOT NULL,
    prevent_new_requests boolean DEFAULT false NOT NULL,
    auto_hide_reported boolean DEFAULT false NOT NULL,
    history_archived boolean DEFAULT false NOT NULL,
    auto_delete_flagged character varying(20),
    admin_closed_at timestamp(0) without time zone,
    admin_muted_at timestamp(0) without time zone,
    restrictions_config json,
    admin_note character varying(1000),
    CONSTRAINT conversations_status_check CHECK (((status)::text = ANY ((ARRAY['approved'::character varying, 'pending_request'::character varying, 'rejected'::character varying, 'blocked'::character varying])::text[])))
);


--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: country_admin_override_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country_admin_override_logs (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    old_country_code character(2),
    old_country_name character varying(100),
    new_country_code character(2) NOT NULL,
    new_country_name character varying(100),
    admin_id bigint NOT NULL,
    reason character varying(500) NOT NULL,
    lock_mode character varying(255) DEFAULT 'reset'::character varying NOT NULL,
    changed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT country_admin_override_logs_lock_mode_check CHECK (((lock_mode)::text = ANY ((ARRAY['keep'::character varying, 'reset'::character varying, 'none'::character varying])::text[])))
);


--
-- Name: country_admin_override_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.country_admin_override_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: country_admin_override_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.country_admin_override_logs_id_seq OWNED BY public.country_admin_override_logs.id;


--
-- Name: country_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country_change_requests (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    current_country_code character(2),
    requested_country_code character(2) NOT NULL,
    requested_country_name character varying(100),
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    continuous_detected_days smallint DEFAULT '0'::smallint NOT NULL,
    verification_started_at timestamp(0) without time zone,
    eligible_at timestamp(0) without time zone,
    approved_at timestamp(0) without time zone,
    rejected_reason character varying(500),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT country_change_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'eligible'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: country_change_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.country_change_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: country_change_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.country_change_requests_id_seq OWNED BY public.country_change_requests.id;


--
-- Name: country_detections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country_detections (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    detected_country_code character(2) NOT NULL,
    detected_country_name character varying(100),
    detected_asn_number integer,
    detected_isp_organization character varying(191),
    detected_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip_hash character(64),
    source character varying(255) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT country_detections_source_check CHECK (((source)::text = ANY ((ARRAY['signup'::character varying, 'login'::character varying, 'app_open'::character varying, 'web_open'::character varying, 'country_change_check'::character varying])::text[])))
);


--
-- Name: country_detections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.country_detections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: country_detections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.country_detections_id_seq OWNED BY public.country_detections.id;


--
-- Name: country_residency_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country_residency_documents (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    requested_country_code character(2) NOT NULL,
    requested_country_name character varying(100) NOT NULL,
    document_type character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_original_name character varying(255),
    file_mime character varying(100),
    file_size_bytes integer,
    residing_since date,
    user_note text,
    status character varying(255) DEFAULT 'pending_review'::character varying NOT NULL,
    reviewed_by bigint,
    reviewed_at timestamp(0) without time zone,
    review_notes character varying(500),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT country_residency_documents_document_type_check CHECK (((document_type)::text = ANY ((ARRAY['passport'::character varying, 'visa'::character varying, 'residence_permit'::character varying, 'national_id'::character varying, 'utility_bill'::character varying, 'bank_statement'::character varying, 'lease_agreement'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT country_residency_documents_status_check CHECK (((status)::text = ANY ((ARRAY['pending_review'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: country_residency_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.country_residency_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: country_residency_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.country_residency_documents_id_seq OWNED BY public.country_residency_documents.id;


--
-- Name: creator_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_analytics (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    date date NOT NULL,
    views bigint DEFAULT '0'::bigint NOT NULL,
    watch_time_mins integer DEFAULT 0 NOT NULL,
    new_followers integer DEFAULT 0 NOT NULL,
    lost_followers integer DEFAULT 0 NOT NULL,
    likes bigint DEFAULT '0'::bigint NOT NULL,
    comments integer DEFAULT 0 NOT NULL,
    shares integer DEFAULT 0 NOT NULL,
    saves integer DEFAULT 0 NOT NULL,
    earnings numeric(10,2) DEFAULT '0'::numeric NOT NULL
);


--
-- Name: creator_analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_analytics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_analytics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_analytics_id_seq OWNED BY public.creator_analytics.id;


--
-- Name: creator_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_applications (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    rejection_reason text,
    applied_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reviewed_at timestamp(0) without time zone,
    reviewed_by bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT creator_applications_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: creator_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_applications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_applications_id_seq OWNED BY public.creator_applications.id;


--
-- Name: creator_earnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_earnings (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    video_id bigint,
    source character varying(255) DEFAULT 'ad_revenue'::character varying NOT NULL,
    amount numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    note character varying(255),
    earned_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT creator_earnings_source_check CHECK (((source)::text = ANY ((ARRAY['ad_revenue'::character varying, 'live_gift'::character varying, 'subscription'::character varying, 'brand_collab'::character varying, 'series'::character varying])::text[]))),
    CONSTRAINT creator_earnings_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'on_hold'::character varying])::text[])))
);


--
-- Name: creator_earnings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_earnings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_earnings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_earnings_id_seq OWNED BY public.creator_earnings.id;


--
-- Name: creator_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_levels (
    id smallint NOT NULL,
    level_name character varying(100) NOT NULL,
    min_xp integer NOT NULL,
    max_xp integer,
    badge_color character varying(7),
    icon_url character varying(500),
    perks json
);


--
-- Name: creator_monetization_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_monetization_status (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    account_standing boolean DEFAULT true NOT NULL,
    ad_revenue_eligible boolean DEFAULT false NOT NULL,
    live_gifts_enabled boolean DEFAULT false NOT NULL,
    subscriptions_enabled boolean DEFAULT false NOT NULL,
    tax_info_completed boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: creator_monetization_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_monetization_status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_monetization_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_monetization_status_id_seq OWNED BY public.creator_monetization_status.id;


--
-- Name: creator_payout_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_payout_methods (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    provider character varying(50) DEFAULT 'paypal'::character varying NOT NULL,
    account_email character varying(255),
    masked_account character varying(100),
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: creator_payout_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_payout_methods_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_payout_methods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_payout_methods_id_seq OWNED BY public.creator_payout_methods.id;


--
-- Name: creator_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_payouts (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    payout_method_id bigint,
    scheduled_at timestamp(0) without time zone,
    paid_at timestamp(0) without time zone,
    failure_reason character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT creator_payouts_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'paid'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: creator_payouts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_payouts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_payouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_payouts_id_seq OWNED BY public.creator_payouts.id;


--
-- Name: creator_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_progress (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    current_level_id smallint DEFAULT '1'::smallint NOT NULL,
    current_xp integer DEFAULT 0 NOT NULL,
    total_xp_earned integer DEFAULT 0 NOT NULL,
    updated_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: creator_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_progress_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_progress_id_seq OWNED BY public.creator_progress.id;


--
-- Name: creator_revenue_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_revenue_goals (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    monthly_goal numeric(12,2) DEFAULT '10000'::numeric NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: creator_revenue_goals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_revenue_goals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_revenue_goals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_revenue_goals_id_seq OWNED BY public.creator_revenue_goals.id;


--
-- Name: creator_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_wallets (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    available_balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    pending_balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    lifetime_earnings numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: creator_wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creator_wallets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creator_wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creator_wallets_id_seq OWNED BY public.creator_wallets.id;


--
-- Name: data_download_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_download_requests (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    completed_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT data_download_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'ready'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: data_download_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_download_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_download_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_download_requests_id_seq OWNED BY public.data_download_requests.id;


--
-- Name: direct_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_messages (
    id bigint NOT NULL,
    sender_id bigint NOT NULL,
    receiver_id bigint NOT NULL,
    body text NOT NULL,
    read_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    message_type character varying(255) DEFAULT 'text'::character varying NOT NULL,
    r2_key character varying(500),
    r2_url character varying(1000),
    thumbnail_key character varying(500),
    thumbnail_url character varying(1000),
    file_size bigint,
    duration integer,
    file_name character varying(255),
    mime_type character varying(100),
    reply_to_message_id bigint,
    edited_at timestamp(0) without time zone,
    is_pinned boolean DEFAULT false NOT NULL,
    pinned_at timestamp(0) without time zone,
    pinned_by_user_id bigint,
    deleted_for_everyone_at timestamp(0) without time zone,
    deleted_by_user_id bigint,
    deleted_for_user_ids jsonb,
    conversation_id bigint,
    story_id bigint,
    story_thumbnail_url character varying(1000),
    flagged_by_admin boolean DEFAULT false NOT NULL,
    admin_flagged_at timestamp(0) without time zone,
    CONSTRAINT direct_messages_message_type_check CHECK (((message_type)::text = ANY ((ARRAY['text'::character varying, 'image'::character varying, 'video'::character varying, 'voice'::character varying, 'audio'::character varying, 'document'::character varying, 'story_reply'::character varying])::text[])))
);


--
-- Name: direct_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.direct_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: direct_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.direct_messages_id_seq OWNED BY public.direct_messages.id;


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp(0) without time zone NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_verification_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_verification_tokens_id_seq OWNED BY public.email_verification_tokens.id;


--
-- Name: failed_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.failed_jobs (
    id bigint NOT NULL,
    uuid character varying(255) NOT NULL,
    connection text NOT NULL,
    queue text NOT NULL,
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
-- Name: followers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followers (
    id bigint NOT NULL,
    follower_id bigint NOT NULL,
    following_id bigint NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status character varying(255) DEFAULT 'accepted'::character varying NOT NULL,
    CONSTRAINT followers_status_check CHECK (((status)::text = ANY ((ARRAY['accepted'::character varying, 'pending'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: followers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.followers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: followers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.followers_id_seq OWNED BY public.followers.id;


--
-- Name: gift_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_transactions (
    id bigint NOT NULL,
    gift_id bigint NOT NULL,
    sender_id bigint NOT NULL,
    receiver_id bigint NOT NULL,
    video_id bigint,
    quantity integer DEFAULT 1 NOT NULL,
    total_coins integer NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: gift_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gift_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gift_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gift_transactions_id_seq OWNED BY public.gift_transactions.id;


--
-- Name: gifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gifts (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    icon_url character varying(500),
    coin_value integer NOT NULL,
    cash_value numeric(8,4) NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: gifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gifts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gifts_id_seq OWNED BY public.gifts.id;


--
-- Name: hashtags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hashtags (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    videos_count integer DEFAULT 0 NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: hashtags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hashtags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hashtags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hashtags_id_seq OWNED BY public.hashtags.id;


--
-- Name: highlights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.highlights (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    title character varying(100) NOT NULL,
    cover_url character varying(500),
    sort_order smallint DEFAULT '0'::smallint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: highlights_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.highlights_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: highlights_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.highlights_id_seq OWNED BY public.highlights.id;


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
-- Name: media_content_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_content_checks (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    media_id bigint,
    video_id bigint,
    upload_id character varying(255),
    media_type character varying(30) NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    nudity_score numeric(6,4),
    violence_score numeric(6,4),
    quality_score numeric(6,4),
    reason text,
    details json,
    checked_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT media_content_checks_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'checking'::character varying, 'passed'::character varying, 'failed'::character varying, 'review'::character varying, 'error'::character varying])::text[])))
);


--
-- Name: media_content_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_content_checks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_content_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_content_checks_id_seq OWNED BY public.media_content_checks.id;


--
-- Name: media_moderation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_moderation (
    id bigint NOT NULL,
    content_id bigint NOT NULL,
    user_id bigint NOT NULL,
    content_type character varying(50) NOT NULL,
    file_key character varying(500) NOT NULL,
    scan_status character varying(255) DEFAULT 'queued'::character varying NOT NULL,
    nudity_detected boolean DEFAULT false NOT NULL,
    nudity_score numeric(5,4) DEFAULT '0'::numeric NOT NULL,
    nsfw_score numeric(5,4) DEFAULT '0'::numeric NOT NULL,
    detected_labels_json json,
    scanned_frames_count smallint DEFAULT '0'::smallint NOT NULL,
    highest_risk_timestamp numeric(8,2),
    decision character varying(255),
    reason text,
    model_name character varying(100),
    model_version character varying(50),
    scanned_at timestamp(0) without time zone,
    admin_review_status character varying(255),
    admin_reviewed_by bigint,
    admin_reviewed_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT media_moderation_admin_review_status_check CHECK (((admin_review_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT media_moderation_decision_check CHECK (((decision)::text = ANY ((ARRAY['approved'::character varying, 'pending_review'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT media_moderation_scan_status_check CHECK (((scan_status)::text = ANY ((ARRAY['queued'::character varying, 'scanning'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: media_moderation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_moderation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_moderation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_moderation_id_seq OWNED BY public.media_moderation.id;


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id bigint NOT NULL,
    key character varying(255) NOT NULL,
    label character varying(255) NOT NULL,
    icon character varying(255),
    route character varying(255),
    platform character varying(255) DEFAULT 'both'::character varying NOT NULL,
    visibility json,
    is_enabled boolean DEFAULT true NOT NULL,
    sort_order smallint DEFAULT '0'::smallint NOT NULL,
    parent_id bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;


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
-- Name: moderation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_logs (
    id bigint NOT NULL,
    content_id bigint NOT NULL,
    user_id bigint,
    action_type character varying(50) NOT NULL,
    old_decision character varying(30),
    new_decision character varying(30),
    admin_id bigint,
    reason text,
    metadata json,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: moderation_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.moderation_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: moderation_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.moderation_logs_id_seq OWNED BY public.moderation_logs.id;


--
-- Name: moderation_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_settings (
    id bigint NOT NULL,
    nsfw_pending_threshold numeric(4,2) DEFAULT 0.65 NOT NULL,
    nsfw_reject_threshold numeric(4,2) DEFAULT 0.85 NOT NULL,
    nudity_pending_threshold numeric(4,2) DEFAULT 0.65 NOT NULL,
    nudity_reject_threshold numeric(4,2) DEFAULT 0.85 NOT NULL,
    video_default_frame_interval_seconds smallint DEFAULT '2'::smallint NOT NULL,
    video_default_scan_duration_seconds smallint DEFAULT '120'::smallint NOT NULL,
    video_full_scan_frame_interval_seconds smallint DEFAULT '1'::smallint NOT NULL,
    auto_reject_enabled boolean DEFAULT true NOT NULL,
    admin_review_required_for_high_risk boolean DEFAULT true NOT NULL,
    moderation_enabled boolean DEFAULT true NOT NULL,
    updated_by bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: moderation_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.moderation_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: moderation_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.moderation_settings_id_seq OWNED BY public.moderation_settings.id;


--
-- Name: music_play_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_play_logs (
    id bigint NOT NULL,
    track_id bigint NOT NULL,
    user_id bigint,
    source character varying(30),
    played_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: music_play_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.music_play_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: music_play_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.music_play_logs_id_seq OWNED BY public.music_play_logs.id;


--
-- Name: music_tracks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_tracks (
    id bigint NOT NULL,
    title character varying(255) NOT NULL,
    artist_name character varying(255),
    album character varying(255),
    featuring_artists json,
    genre character varying(100),
    mood character varying(100),
    language character varying(50),
    tags json,
    release_date date,
    bpm smallint,
    music_key character varying(20),
    isrc character varying(50),
    copyright_owner character varying(255),
    license_type character varying(100),
    usage_permissions json,
    region_restrictions json,
    commercial_use_allowed boolean DEFAULT true NOT NULL,
    creator_safe boolean DEFAULT true NOT NULL,
    monetization_safe boolean DEFAULT true NOT NULL,
    explicit_content boolean DEFAULT false NOT NULL,
    description text,
    lyrics text,
    audio_r2_key character varying(255),
    audio_url character varying(255),
    cover_r2_key character varying(255),
    cover_url character varying(255),
    duration integer,
    file_size bigint,
    format character varying(20),
    bitrate integer,
    sample_rate integer,
    waveform_data json,
    plays_count bigint DEFAULT '0'::bigint NOT NULL,
    uses_count bigint DEFAULT '0'::bigint NOT NULL,
    downloads_count bigint DEFAULT '0'::bigint NOT NULL,
    status character varying(255) DEFAULT 'draft'::character varying NOT NULL,
    recommended boolean DEFAULT false NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    allow_reels boolean DEFAULT true NOT NULL,
    allow_stories boolean DEFAULT true NOT NULL,
    allow_downloads boolean DEFAULT false NOT NULL,
    show_in_studio boolean DEFAULT true NOT NULL,
    show_in_upload_picker boolean DEFAULT true NOT NULL,
    created_by_admin_id bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    source_type character varying(255) DEFAULT 'library'::character varying NOT NULL,
    source_video_id bigint,
    CONSTRAINT music_tracks_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['library'::character varying, 'original'::character varying])::text[]))),
    CONSTRAINT music_tracks_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'pending'::character varying, 'archived'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: music_tracks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.music_tracks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: music_tracks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.music_tracks_id_seq OWNED BY public.music_tracks.id;


--
-- Name: music_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_usage (
    id bigint NOT NULL,
    track_id bigint NOT NULL,
    user_id bigint NOT NULL,
    content_id bigint,
    content_type character varying(20),
    used_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: music_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.music_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: music_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.music_usage_id_seq OWNED BY public.music_usage.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    actor_id bigint,
    type character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id bigint,
    message character varying(500),
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    action_status character varying(20)
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


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
    name character varying(255) NOT NULL,
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
-- Name: playlist_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlist_videos (
    id bigint NOT NULL,
    playlist_id bigint NOT NULL,
    video_id bigint NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: playlist_videos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playlist_videos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playlist_videos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playlist_videos_id_seq OWNED BY public.playlist_videos.id;


--
-- Name: playlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlists (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    cover_url character varying(500),
    type character varying(50) DEFAULT 'curated'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    videos_count integer DEFAULT 0 NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    deleted_at timestamp(0) without time zone
);


--
-- Name: playlists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playlists_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playlists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playlists_id_seq OWNED BY public.playlists.id;


--
-- Name: profile_suggestion_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_suggestion_dismissals (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    suggested_user_id bigint NOT NULL,
    dismissed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: profile_suggestion_dismissals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_suggestion_dismissals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_suggestion_dismissals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_suggestion_dismissals_id_seq OWNED BY public.profile_suggestion_dismissals.id;


--
-- Name: profile_suggestion_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_suggestion_logs (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    suggested_user_id bigint NOT NULL,
    context character varying(30) DEFAULT 'home'::character varying NOT NULL,
    score numeric(6,4) DEFAULT '0'::numeric NOT NULL,
    reason character varying(255),
    shown_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    clicked_at timestamp(0) without time zone,
    followed_at timestamp(0) without time zone
);


--
-- Name: profile_suggestion_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_suggestion_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_suggestion_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_suggestion_logs_id_seq OWNED BY public.profile_suggestion_logs.id;


--
-- Name: profile_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_views (
    id bigint NOT NULL,
    profile_user_id bigint NOT NULL,
    viewer_id bigint,
    ip_address character varying(45),
    user_agent text,
    viewed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: profile_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profile_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profile_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profile_views_id_seq OWNED BY public.profile_views.id;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    location character varying(255),
    website character varying(500),
    joined_label character varying(50),
    category character varying(100),
    creator_badge character varying(50),
    total_followers integer DEFAULT 0 NOT NULL,
    total_following integer DEFAULT 0 NOT NULL,
    total_likes bigint DEFAULT '0'::bigint NOT NULL,
    total_videos integer DEFAULT 0 NOT NULL,
    profile_views bigint DEFAULT '0'::bigint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profiles_id_seq OWNED BY public.profiles.id;


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    video_id bigint NOT NULL,
    objective character varying(60) DEFAULT 'more_views'::character varying NOT NULL,
    country character varying(100),
    age_range character varying(20),
    gender character varying(10) DEFAULT 'all'::character varying NOT NULL,
    interests json,
    daily_budget numeric(12,2) DEFAULT '1'::numeric NOT NULL,
    total_budget numeric(12,2) DEFAULT '7'::numeric NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    start_date date,
    end_date date,
    duration_days smallint DEFAULT '7'::smallint NOT NULL,
    payment_method character varying(60),
    est_impressions_min integer,
    est_impressions_max integer,
    est_views_min integer,
    est_views_max integer,
    est_profile_visits_min integer,
    est_profile_visits_max integer,
    status character varying(30) DEFAULT 'draft'::character varying NOT NULL,
    rejection_reason text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: promotions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promotions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promotions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promotions_id_seq OWNED BY public.promotions.id;


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    id bigint NOT NULL,
    identifier character varying(191) NOT NULL,
    identifier_type character varying(255) NOT NULL,
    action_type character varying(50) NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    window_start timestamp(0) without time zone,
    blocked_until timestamp(0) without time zone,
    block_level smallint DEFAULT '0'::smallint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT rate_limits_identifier_type_check CHECK (((identifier_type)::text = ANY ((ARRAY['ip'::character varying, 'account'::character varying, 'device'::character varying])::text[])))
);


--
-- Name: rate_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rate_limits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rate_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rate_limits_id_seq OWNED BY public.rate_limits.id;


--
-- Name: security_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_logs (
    id bigint NOT NULL,
    action character varying(100) NOT NULL,
    severity character varying(20) DEFAULT 'info'::character varying NOT NULL,
    ip_address character varying(45),
    identifier_type character varying(20),
    identifier character varying(191),
    action_type character varying(50),
    description text,
    metadata json,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: security_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_logs_id_seq OWNED BY public.security_logs.id;


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
-- Name: signup_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signup_drafts (
    id bigint NOT NULL,
    draft_token character varying(64) NOT NULL,
    email character varying(191) NOT NULL,
    name character varying(100),
    username character varying(50),
    date_of_birth date,
    country character varying(100),
    country_code character varying(2),
    otp_hash character varying(64),
    link_token_hash character varying(64),
    email_verified boolean DEFAULT false NOT NULL,
    email_verified_at timestamp(0) without time zone,
    expires_at timestamp(0) without time zone NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    user_id bigint
);


--
-- Name: signup_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.signup_drafts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: signup_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.signup_drafts_id_seq OWNED BY public.signup_drafts.id;


--
-- Name: social_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_links (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    platform character varying(50) NOT NULL,
    url character varying(500) NOT NULL,
    sort_order smallint DEFAULT '0'::smallint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: social_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.social_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: social_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.social_links_id_seq OWNED BY public.social_links.id;


--
-- Name: stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stories (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    caption text,
    visibility character varying(255) DEFAULT 'everyone'::character varying NOT NULL,
    allow_replies boolean DEFAULT true NOT NULL,
    allow_resharing boolean DEFAULT true NOT NULL,
    save_to_archive boolean DEFAULT true NOT NULL,
    status character varying(255) DEFAULT 'published'::character varying NOT NULL,
    location character varying(255),
    link character varying(500),
    tagged_users json,
    stickers json,
    music_id bigint,
    expires_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    deleted_at timestamp(0) without time zone,
    CONSTRAINT stories_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'archived'::character varying, 'expired'::character varying])::text[]))),
    CONSTRAINT stories_visibility_check CHECK (((visibility)::text = ANY ((ARRAY['everyone'::character varying, 'followers'::character varying, 'close_friends'::character varying, 'only_me'::character varying])::text[])))
);


--
-- Name: stories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stories_id_seq OWNED BY public.stories.id;


--
-- Name: story_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_layers (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    slide_index smallint DEFAULT '0'::smallint NOT NULL,
    type character varying(20) NOT NULL,
    text text,
    url character varying(500),
    mentioned_user_id bigint,
    hashtag character varying(200),
    location_name character varying(255),
    x_percent numeric(6,2) DEFAULT '50'::numeric NOT NULL,
    y_percent numeric(6,2) DEFAULT '50'::numeric NOT NULL,
    scale_value numeric(5,2) DEFAULT '1'::numeric NOT NULL,
    rotation numeric(7,2) DEFAULT '0'::numeric NOT NULL,
    color character varying(20) DEFAULT '#ffffff'::character varying NOT NULL,
    font character varying(30) DEFAULT 'classic'::character varying NOT NULL,
    z_index smallint DEFAULT '0'::smallint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: story_layers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_layers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_layers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_layers_id_seq OWNED BY public.story_layers.id;


--
-- Name: story_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_media (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    media_type character varying(255) DEFAULT 'image'::character varying NOT NULL,
    media_url character varying(500),
    thumbnail_url character varying(500),
    duration_seconds smallint,
    order_index smallint DEFAULT '0'::smallint NOT NULL,
    metadata json,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    source_type character varying(20) DEFAULT 'upload'::character varying NOT NULL,
    shared_video_id bigint,
    CONSTRAINT story_media_media_type_check CHECK (((media_type)::text = ANY ((ARRAY['image'::character varying, 'video'::character varying, 'text'::character varying])::text[])))
);


--
-- Name: story_media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_media_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_media_id_seq OWNED BY public.story_media.id;


--
-- Name: story_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_messages (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    sender_id bigint NOT NULL,
    receiver_id bigint NOT NULL,
    message text NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: story_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_messages_id_seq OWNED BY public.story_messages.id;


--
-- Name: story_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_reactions (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    user_id bigint NOT NULL,
    reaction_type character varying(20) DEFAULT 'heart'::character varying NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: story_reactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_reactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_reactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_reactions_id_seq OWNED BY public.story_reactions.id;


--
-- Name: story_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_reports (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    reporter_id bigint NOT NULL,
    reason character varying(100) DEFAULT 'inappropriate'::character varying NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT story_reports_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'reviewed'::character varying, 'actioned'::character varying, 'dismissed'::character varying])::text[])))
);


--
-- Name: story_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_reports_id_seq OWNED BY public.story_reports.id;


--
-- Name: story_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_views (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    viewer_id bigint NOT NULL,
    viewed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: story_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_views_id_seq OWNED BY public.story_views.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    plan character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    price numeric(8,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    started_at timestamp(0) without time zone,
    expires_at timestamp(0) without time zone,
    cancelled_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT subscriptions_plan_check CHECK (((plan)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying])::text[]))),
    CONSTRAINT subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: user_admin_restrictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_admin_restrictions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    restriction_type character varying(255) NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    expires_at timestamp(0) without time zone,
    reason character varying(500),
    created_by_admin_id bigint,
    updated_by_admin_id bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT user_admin_restrictions_restriction_type_check CHECK (((restriction_type)::text = ANY ((ARRAY['restrict_uploads'::character varying, 'post_approval_required'::character varying, 'block_live_access'::character varying, 'disable_draft_creation'::character varying, 'disable_commenting_on_uploads'::character varying, 'disable_commenting_on_others'::character varying, 'disable_following_others'::character varying])::text[])))
);


--
-- Name: user_admin_restrictions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_admin_restrictions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_admin_restrictions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_admin_restrictions_id_seq OWNED BY public.user_admin_restrictions.id;


--
-- Name: user_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_devices (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    device_token character varying(500) NOT NULL,
    platform character varying(255) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    CONSTRAINT user_devices_platform_check CHECK (((platform)::text = ANY ((ARRAY['android'::character varying, 'ios'::character varying])::text[])))
);


--
-- Name: user_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_devices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_devices_id_seq OWNED BY public.user_devices.id;


--
-- Name: user_hidden_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_hidden_words (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    word character varying(100) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: user_hidden_words_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_hidden_words_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_hidden_words_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_hidden_words_id_seq OWNED BY public.user_hidden_words.id;


--
-- Name: user_moderation_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_moderation_settings (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    restrict_uploads boolean DEFAULT false NOT NULL,
    post_approval_required boolean DEFAULT false NOT NULL,
    block_live_access boolean DEFAULT false NOT NULL,
    disable_drafts boolean DEFAULT false NOT NULL,
    disable_commenting boolean DEFAULT false NOT NULL,
    daily_upload_limit smallint,
    nsfw_review_required boolean DEFAULT false NOT NULL,
    copyright_hold boolean DEFAULT false NOT NULL,
    upload_suspension_until timestamp(0) without time zone,
    shadowban boolean DEFAULT false NOT NULL,
    temporary_suspension boolean DEFAULT false NOT NULL,
    warning_level smallint DEFAULT '0'::smallint NOT NULL,
    content_review_mode character varying(20) DEFAULT 'standard'::character varying NOT NULL,
    comment_moderation character varying(20) DEFAULT 'standard'::character varying NOT NULL,
    message_monitoring boolean DEFAULT false NOT NULL,
    strike_count smallint DEFAULT '0'::smallint NOT NULL,
    last_warning_at timestamp(0) without time zone,
    last_strike_at timestamp(0) without time zone,
    last_appeal_at timestamp(0) without time zone,
    appeal_status character varying(20),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    allow_dm character varying(20) DEFAULT 'everyone'::character varying NOT NULL,
    allow_mentions character varying(20) DEFAULT 'everyone'::character varying NOT NULL,
    content_filter character varying(20) DEFAULT 'standard'::character varying NOT NULL,
    sensitive_filter boolean DEFAULT true NOT NULL,
    activity_visibility character varying(20) DEFAULT 'everyone'::character varying NOT NULL,
    disable_commenting_on_others boolean DEFAULT false NOT NULL,
    disable_following_others boolean DEFAULT false NOT NULL,
    temporary_suspension_until timestamp(0) without time zone
);


--
-- Name: user_moderation_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_moderation_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_moderation_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_moderation_settings_id_seq OWNED BY public.user_moderation_settings.id;


--
-- Name: user_permission_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permission_settings (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    live_permission boolean DEFAULT true NOT NULL,
    duet_permission boolean DEFAULT true NOT NULL,
    download_permission boolean DEFAULT true NOT NULL,
    collaboration_permission boolean DEFAULT true NOT NULL,
    messaging_permission character varying(20) DEFAULT 'everyone'::character varying NOT NULL,
    access_level character varying(20) DEFAULT 'full'::character varying NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: user_permission_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_permission_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_permission_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_permission_settings_id_seq OWNED BY public.user_permission_settings.id;


--
-- Name: user_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reports (
    id bigint NOT NULL,
    reported_user_id bigint NOT NULL,
    reporter_id bigint NOT NULL,
    reason character varying(255) NOT NULL,
    description text,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_by bigint,
    reviewed_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_reports_reason_check CHECK (((reason)::text = ANY ((ARRAY['spam'::character varying, 'harassment'::character varying, 'fake'::character varying, 'hate'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT user_reports_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'reviewed'::character varying, 'dismissed'::character varying, 'actioned'::character varying])::text[])))
);


--
-- Name: user_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_reports_id_seq OWNED BY public.user_reports.id;


--
-- Name: user_video_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_video_preferences (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    pref_type character varying(255) NOT NULL,
    pref_value character varying(100) NOT NULL,
    weight numeric(6,3) DEFAULT '1'::numeric NOT NULL,
    interaction_count integer DEFAULT 1 NOT NULL,
    updated_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_video_preferences_pref_type_check CHECK (((pref_type)::text = ANY ((ARRAY['hashtag'::character varying, 'category'::character varying, 'creator'::character varying])::text[])))
);


--
-- Name: user_video_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_video_preferences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_video_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_video_preferences_id_seq OWNED BY public.user_video_preferences.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(191) NOT NULL,
    phone character varying(20),
    password character varying(255) NOT NULL,
    avatar character varying(255),
    date_of_birth date,
    country character varying(100),
    bio text,
    role character varying(255) DEFAULT 'user'::character varying NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    is_private boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    ban_reason character varying(255),
    remember_token character varying(100),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    deleted_at timestamp(0) without time zone,
    email_verified_at timestamp(0) without time zone,
    selected_country_code character(2),
    selected_country_name character varying(100),
    detected_country_code character(2),
    detected_country_name character varying(100),
    detected_asn_number integer,
    detected_isp_organization character varying(191),
    country_locked_until timestamp(0) without time zone,
    country_last_changed_at timestamp(0) without time zone,
    country_change_eligible_at timestamp(0) without time zone,
    country_change_status character varying(255) DEFAULT 'none'::character varying NOT NULL,
    admin_country_override boolean DEFAULT false NOT NULL,
    admin_country_override_by bigint,
    admin_country_override_at timestamp(0) without time zone,
    admin_country_override_reason character varying(500),
    gender character varying(32),
    language character varying(8) DEFAULT 'en'::character varying NOT NULL,
    interests jsonb,
    website character varying(500),
    location character varying(255),
    categories jsonb,
    city_name character varying(191),
    region_name character varying(191),
    local_location character varying(500),
    location_lat numeric(10,7),
    location_lng numeric(10,7),
    location_source character varying(255) DEFAULT 'none'::character varying NOT NULL,
    location_updated_at timestamp(0) without time zone,
    message_privacy character varying(255) DEFAULT 'everyone'::character varying NOT NULL,
    save_watch_history boolean DEFAULT true NOT NULL,
    saved_privacy character varying(20) DEFAULT 'private'::character varying NOT NULL,
    creator_terms_accepted_at timestamp(0) without time zone,
    active_status boolean DEFAULT true NOT NULL,
    profile_discovery boolean DEFAULT true NOT NULL,
    show_to_search_engines boolean DEFAULT false NOT NULL,
    who_can_comment character varying(20) DEFAULT 'everyone'::character varying NOT NULL,
    who_can_tag character varying(20) DEFAULT 'friends'::character varying NOT NULL,
    who_can_duet character varying(20) DEFAULT 'friends'::character varying NOT NULL,
    who_can_download character varying(20) DEFAULT 'everyone'::character varying NOT NULL,
    who_can_see_liked character varying(20) DEFAULT 'only_me'::character varying NOT NULL,
    comment_filter boolean DEFAULT true NOT NULL,
    login_alerts boolean DEFAULT true NOT NULL,
    password_changed_at timestamp(0) without time zone,
    notification_preferences json,
    content_preferences json,
    accessibility_preferences json,
    suspended_until timestamp(0) without time zone,
    last_active_at timestamp(0) without time zone,
    trust_score numeric(4,3) DEFAULT 0.8 NOT NULL,
    last_login_at timestamp(0) without time zone,
    two_factor_secret text,
    two_factor_recovery_codes text,
    two_factor_confirmed_at timestamp(0) without time zone,
    profile_view_history boolean DEFAULT true NOT NULL,
    activity_status character varying(10) DEFAULT 'public'::character varying NOT NULL,
    CONSTRAINT users_country_change_status_check CHECK (((country_change_status)::text = ANY ((ARRAY['none'::character varying, 'pending'::character varying, 'eligible'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT users_location_source_check CHECK (((location_source)::text = ANY ((ARRAY['gps'::character varying, 'ip'::character varying, 'manual'::character varying, 'nominatim'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT users_message_privacy_check CHECK (((message_privacy)::text = ANY ((ARRAY['everyone'::character varying, 'friends'::character varying, 'followers'::character varying, 'no_one'::character varying])::text[]))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'creator'::character varying, 'admin'::character varying])::text[])))
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
-- Name: verification_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_requests (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    category character varying(100),
    document_url character varying(500),
    reason text,
    status character varying(255) DEFAULT 'draft'::character varying NOT NULL,
    rejection_reason text,
    reviewed_by bigint,
    reviewed_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    document_key character varying(500),
    full_name character varying(255),
    phone character varying(30),
    brand_name character varying(255),
    social_links json,
    website character varying(255),
    country character varying(100),
    selfie_url character varying(255),
    selfie_key character varying(255),
    supporting_doc_url character varying(255),
    supporting_doc_key character varying(255),
    plan_id character varying(20),
    verification_step character varying(30),
    CONSTRAINT verification_requests_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: verification_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verification_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verification_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verification_requests_id_seq OWNED BY public.verification_requests.id;


--
-- Name: video_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_comments (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    user_id bigint NOT NULL,
    parent_id bigint,
    body text NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    deleted_at timestamp(0) without time zone,
    comment_rank smallint,
    dislike_count integer DEFAULT 0 NOT NULL,
    reply_count integer DEFAULT 0 NOT NULL,
    reaction_score integer DEFAULT 0 NOT NULL,
    pin_order integer,
    pinned_at timestamp(0) without time zone,
    pinned_by bigint,
    is_edited boolean DEFAULT false NOT NULL,
    edited_at timestamp(0) without time zone,
    gif_url character varying(500),
    gif_preview_url character varying(500),
    gif_provider character varying(50),
    gif_provider_id character varying(100),
    root_id bigint,
    is_spam boolean DEFAULT false NOT NULL,
    held_for_review boolean DEFAULT false NOT NULL,
    creator_seen_at timestamp(0) without time zone,
    creator_note text
);


--
-- Name: video_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_comments_id_seq OWNED BY public.video_comments.id;


--
-- Name: video_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_events (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    user_id bigint,
    session_id character varying(64),
    event_type character varying(255) NOT NULL,
    payload json,
    ip_address character varying(45),
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT video_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['view_progress'::character varying, 'skip'::character varying, 'rewatch'::character varying, 'like'::character varying, 'comment'::character varying, 'share'::character varying, 'save'::character varying, 'follow_from_video'::character varying, 'not_interested'::character varying, 'report'::character varying])::text[])))
);


--
-- Name: video_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_events_id_seq OWNED BY public.video_events.id;


--
-- Name: video_hashtags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_hashtags (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    hashtag_id bigint NOT NULL,
    country_code character(2),
    country_name character varying(100),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: video_hashtags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_hashtags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_hashtags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_hashtags_id_seq OWNED BY public.video_hashtags.id;


--
-- Name: video_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_likes (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    user_id bigint NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: video_likes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_likes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_likes_id_seq OWNED BY public.video_likes.id;


--
-- Name: video_monetization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_monetization (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    eligibility_status character varying(30) DEFAULT 'not_eligible'::character varying NOT NULL,
    review_status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_on timestamp(0) without time zone,
    next_review timestamp(0) without time zone,
    ad_revenue_sharing boolean DEFAULT false NOT NULL,
    creator_fund_active boolean DEFAULT false NOT NULL,
    tips_gifts_enabled boolean DEFAULT false NOT NULL,
    subscriptions_eligible boolean DEFAULT false NOT NULL,
    brand_partnerships_eligible boolean DEFAULT false NOT NULL,
    shop_product_tagging boolean DEFAULT false NOT NULL,
    paid_promotion_disclosure character varying(30) DEFAULT 'not_required'::character varying NOT NULL,
    affiliate_links_enabled boolean DEFAULT false NOT NULL,
    brand_deals_allowed boolean DEFAULT false NOT NULL,
    auto_claim_brand_mentions boolean DEFAULT false NOT NULL,
    total_earnings numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    rpm numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    cpm numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    revenue numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    next_payout numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    payout_date date,
    payout_method character varying(30),
    payout_currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    payout_status character varying(30) DEFAULT 'up_to_date'::character varying NOT NULL,
    allowed_regions json,
    blocked_regions json,
    policy_status character varying(30) DEFAULT 'compliant'::character varying NOT NULL,
    monetization_notes text,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: video_monetization_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_monetization_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_monetization_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_monetization_id_seq OWNED BY public.video_monetization.id;


--
-- Name: video_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_reports (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    reporter_id bigint NOT NULL,
    reason character varying(255) NOT NULL,
    description text,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_by bigint,
    reviewed_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT video_reports_reason_check CHECK (((reason)::text = ANY ((ARRAY['spam'::character varying, 'nudity'::character varying, 'hate'::character varying, 'misinformation'::character varying, 'violence'::character varying, 'copyright'::character varying, 'harassment'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT video_reports_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'reviewed'::character varying, 'dismissed'::character varying, 'actioned'::character varying])::text[])))
);


--
-- Name: video_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_reports_id_seq OWNED BY public.video_reports.id;


--
-- Name: video_saves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_saves (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    user_id bigint NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: video_saves_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_saves_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_saves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_saves_id_seq OWNED BY public.video_saves.id;


--
-- Name: video_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_scores (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    score numeric(10,4) DEFAULT '0'::numeric NOT NULL,
    completion_score numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    rewatch_score numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    like_score numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    comment_score numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    share_score numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    save_score numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    follow_score numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    skip_penalty numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    report_penalty numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    event_count integer DEFAULT 0 NOT NULL,
    computed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: video_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_scores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_scores_id_seq OWNED BY public.video_scores.id;


--
-- Name: video_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_shares (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    user_id bigint,
    platform character varying(50),
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: video_shares_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_shares_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_shares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_shares_id_seq OWNED BY public.video_shares.id;


--
-- Name: video_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_views (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    user_id bigint,
    ip_address character varying(45),
    watch_duration smallint,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source character varying(50),
    country character varying(100),
    city character varying(100),
    device_type character varying(20)
);


--
-- Name: video_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_views_id_seq OWNED BY public.video_views.id;


--
-- Name: video_watch_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_watch_events (
    id bigint NOT NULL,
    session_id character varying(64) NOT NULL,
    video_id bigint NOT NULL,
    user_id bigint,
    event_type character varying(30) NOT NULL,
    "current_time" smallint DEFAULT '0'::smallint NOT NULL,
    watched_delta smallint DEFAULT '0'::smallint NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: video_watch_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_watch_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_watch_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_watch_events_id_seq OWNED BY public.video_watch_events.id;


--
-- Name: video_watch_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_watch_sessions (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    user_id bigint,
    session_id character varying(64) NOT NULL,
    device_id character varying(64),
    ip_hash character varying(64),
    started_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at timestamp(0) without time zone,
    watch_seconds smallint DEFAULT '0'::smallint NOT NULL,
    max_position smallint DEFAULT '0'::smallint NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    replay_count smallint DEFAULT '0'::smallint NOT NULL,
    view_counted boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


--
-- Name: video_watch_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.video_watch_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: video_watch_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.video_watch_sessions_id_seq OWNED BY public.video_watch_sessions.id;


--
-- Name: videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    title character varying(255),
    caption text,
    video_url character varying(500) NOT NULL,
    thumbnail_url character varying(500),
    duration smallint,
    file_size bigint,
    width smallint,
    height smallint,
    audio_track_id bigint,
    custom_audio_name character varying(255),
    status character varying(255) DEFAULT 'published'::character varying NOT NULL,
    scheduled_at timestamp(0) without time zone,
    allow_comments boolean DEFAULT true NOT NULL,
    allow_duet boolean DEFAULT true NOT NULL,
    allow_stitch boolean DEFAULT true NOT NULL,
    views_count bigint DEFAULT '0'::bigint NOT NULL,
    likes_count bigint DEFAULT '0'::bigint NOT NULL,
    comments_count integer DEFAULT 0 NOT NULL,
    saves_count integer DEFAULT 0 NOT NULL,
    shares_count integer DEFAULT 0 NOT NULL,
    is_flagged boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    deleted_at timestamp(0) without time zone,
    mime_type character varying(100),
    media_items json,
    moderation_status character varying(255) DEFAULT 'approved'::character varying NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    pinned_at timestamp(0) without time zone,
    quality_urls json,
    category character varying(100),
    location character varying(255),
    language character varying(10) DEFAULT 'en'::character varying,
    allow_download boolean DEFAULT false NOT NULL,
    is_ai_generated boolean DEFAULT false NOT NULL,
    content_check_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    content_check_passed boolean DEFAULT false NOT NULL,
    content_check_reason text,
    original_audio_volume smallint DEFAULT '100'::smallint NOT NULL,
    music_volume smallint DEFAULT '50'::smallint NOT NULL,
    is_original_audio_muted boolean DEFAULT false NOT NULL,
    is_music_muted boolean DEFAULT false NOT NULL,
    music_track_id bigint,
    audio_type character varying(255),
    allow_replies boolean DEFAULT true NOT NULL,
    allow_sharing boolean DEFAULT true NOT NULL,
    allow_embedding boolean DEFAULT false NOT NULL,
    show_on_profile boolean DEFAULT true NOT NULL,
    age_restriction character varying(20) DEFAULT 'everyone'::character varying NOT NULL,
    content_label character varying(50),
    sensitive_warning boolean DEFAULT false NOT NULL,
    notify_followers boolean DEFAULT true NOT NULL,
    send_push_after_publish boolean DEFAULT true NOT NULL,
    recommendation_eligible boolean DEFAULT true NOT NULL,
    search_indexing boolean DEFAULT true NOT NULL,
    region_allowed json,
    region_blocked json,
    shadowban_enabled boolean DEFAULT false NOT NULL,
    limited_distribution boolean DEFAULT false NOT NULL,
    limited_reason text,
    review_priority character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    copyright_match_status character varying(50),
    duplicate_match_status character varying(50),
    content_fingerprint character varying(255),
    legal_hold boolean DEFAULT false NOT NULL,
    reporting_sensitivity character varying(20) DEFAULT 'standard'::character varying NOT NULL,
    archive_status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    auto_archive_after character varying(30) DEFAULT 'never'::character varying NOT NULL,
    captions_file_url character varying(255),
    admin_notes text,
    audit_notes text,
    previous_status character varying(30),
    deleted_by_user_id bigint,
    deleted_by_admin_id bigint,
    deletion_reason text,
    restored_at timestamp(0) without time zone,
    restored_by_admin_id bigint,
    total_watch_seconds bigint DEFAULT '0'::bigint NOT NULL,
    average_watch_seconds smallint DEFAULT '0'::smallint NOT NULL,
    completion_rate smallint DEFAULT '0'::smallint NOT NULL,
    rewatch_rate smallint DEFAULT '0'::smallint NOT NULL,
    total_completions integer DEFAULT 0 NOT NULL,
    total_replays integer DEFAULT 0 NOT NULL,
    CONSTRAINT videos_audio_type_check CHECK (((audio_type)::text = ANY ((ARRAY['library_music'::character varying, 'original_audio'::character varying])::text[]))),
    CONSTRAINT videos_moderation_status_check CHECK (((moderation_status)::text = ANY ((ARRAY['pending'::character varying, 'scanning'::character varying, 'approved'::character varying, 'pending_review'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT videos_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'published'::character varying, 'private'::character varying, 'unlisted'::character varying, 'removed'::character varying])::text[])))
);


--
-- Name: videos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.videos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: videos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.videos_id_seq OWNED BY public.videos.id;


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id bigint NOT NULL,
    wallet_id bigint NOT NULL,
    type character varying(50) DEFAULT 'credit'::character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    description character varying(255),
    reference_id character varying(100),
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    gross_coins bigint DEFAULT '0'::bigint NOT NULL,
    commission_coins bigint DEFAULT '0'::bigint NOT NULL,
    net_coins bigint DEFAULT '0'::bigint NOT NULL,
    balance_after_coins bigint DEFAULT '0'::bigint NOT NULL,
    wallet_balance_after_usd numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    status character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    metadata json
);


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_transactions_id_seq OWNED BY public.wallet_transactions.id;


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallets (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    coins_balance bigint DEFAULT '0'::bigint NOT NULL,
    gift_earnings numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    subscription_earnings numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    ad_earnings numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total_withdrawn numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    bonus_coin_balance bigint DEFAULT '0'::bigint NOT NULL,
    earned_coin_balance bigint DEFAULT '0'::bigint NOT NULL,
    wallet_balance_usd numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    pending_balance_usd numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total_received_coins bigint DEFAULT '0'::bigint NOT NULL,
    total_commission_coins bigint DEFAULT '0'::bigint NOT NULL,
    total_net_earned_coins bigint DEFAULT '0'::bigint NOT NULL,
    total_spent_coins bigint DEFAULT '0'::bigint NOT NULL,
    total_purchased_coins bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallets_id_seq OWNED BY public.wallets.id;


--
-- Name: account_deletion_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletion_requests ALTER COLUMN id SET DEFAULT nextval('public.account_deletion_requests_id_seq'::regclass);


--
-- Name: admin_action_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_action_logs_id_seq'::regclass);


--
-- Name: admin_coin_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_coin_settings ALTER COLUMN id SET DEFAULT nextval('public.admin_coin_settings_id_seq'::regclass);


--
-- Name: admin_commissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_commissions ALTER COLUMN id SET DEFAULT nextval('public.admin_commissions_id_seq'::regclass);


--
-- Name: admin_user_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user_notes ALTER COLUMN id SET DEFAULT nextval('public.admin_user_notes_id_seq'::regclass);


--
-- Name: app_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);


--
-- Name: audio_favorites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_favorites ALTER COLUMN id SET DEFAULT nextval('public.audio_favorites_id_seq'::regclass);


--
-- Name: audio_tracks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_tracks ALTER COLUMN id SET DEFAULT nextval('public.audio_tracks_id_seq'::regclass);


--
-- Name: blocked_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users ALTER COLUMN id SET DEFAULT nextval('public.blocked_users_id_seq'::regclass);


--
-- Name: cms_pages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages ALTER COLUMN id SET DEFAULT nextval('public.cms_pages_id_seq'::regclass);


--
-- Name: coin_gifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_gifts ALTER COLUMN id SET DEFAULT nextval('public.coin_gifts_id_seq'::regclass);


--
-- Name: coin_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_orders ALTER COLUMN id SET DEFAULT nextval('public.coin_orders_id_seq'::regclass);


--
-- Name: coin_packages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_packages ALTER COLUMN id SET DEFAULT nextval('public.coin_packages_id_seq'::regclass);


--
-- Name: comment_likes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes ALTER COLUMN id SET DEFAULT nextval('public.comment_likes_id_seq'::regclass);


--
-- Name: comment_mentions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_mentions ALTER COLUMN id SET DEFAULT nextval('public.comment_mentions_id_seq'::regclass);


--
-- Name: comment_reactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions ALTER COLUMN id SET DEFAULT nextval('public.comment_reactions_id_seq'::regclass);


--
-- Name: comment_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reports ALTER COLUMN id SET DEFAULT nextval('public.comment_reports_id_seq'::regclass);


--
-- Name: comment_restricted_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_restricted_users ALTER COLUMN id SET DEFAULT nextval('public.comment_restricted_users_id_seq'::regclass);


--
-- Name: conversation_admin_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_admin_logs ALTER COLUMN id SET DEFAULT nextval('public.conversation_admin_logs_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: country_admin_override_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_admin_override_logs ALTER COLUMN id SET DEFAULT nextval('public.country_admin_override_logs_id_seq'::regclass);


--
-- Name: country_change_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_change_requests ALTER COLUMN id SET DEFAULT nextval('public.country_change_requests_id_seq'::regclass);


--
-- Name: country_detections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_detections ALTER COLUMN id SET DEFAULT nextval('public.country_detections_id_seq'::regclass);


--
-- Name: country_residency_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_residency_documents ALTER COLUMN id SET DEFAULT nextval('public.country_residency_documents_id_seq'::regclass);


--
-- Name: creator_analytics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_analytics ALTER COLUMN id SET DEFAULT nextval('public.creator_analytics_id_seq'::regclass);


--
-- Name: creator_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_applications ALTER COLUMN id SET DEFAULT nextval('public.creator_applications_id_seq'::regclass);


--
-- Name: creator_earnings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_earnings ALTER COLUMN id SET DEFAULT nextval('public.creator_earnings_id_seq'::regclass);


--
-- Name: creator_monetization_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_monetization_status ALTER COLUMN id SET DEFAULT nextval('public.creator_monetization_status_id_seq'::regclass);


--
-- Name: creator_payout_methods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payout_methods ALTER COLUMN id SET DEFAULT nextval('public.creator_payout_methods_id_seq'::regclass);


--
-- Name: creator_payouts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payouts ALTER COLUMN id SET DEFAULT nextval('public.creator_payouts_id_seq'::regclass);


--
-- Name: creator_progress id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_progress ALTER COLUMN id SET DEFAULT nextval('public.creator_progress_id_seq'::regclass);


--
-- Name: creator_revenue_goals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_revenue_goals ALTER COLUMN id SET DEFAULT nextval('public.creator_revenue_goals_id_seq'::regclass);


--
-- Name: creator_wallets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallets ALTER COLUMN id SET DEFAULT nextval('public.creator_wallets_id_seq'::regclass);


--
-- Name: data_download_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_download_requests ALTER COLUMN id SET DEFAULT nextval('public.data_download_requests_id_seq'::regclass);


--
-- Name: direct_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages ALTER COLUMN id SET DEFAULT nextval('public.direct_messages_id_seq'::regclass);


--
-- Name: email_verification_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens ALTER COLUMN id SET DEFAULT nextval('public.email_verification_tokens_id_seq'::regclass);


--
-- Name: failed_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_jobs ALTER COLUMN id SET DEFAULT nextval('public.failed_jobs_id_seq'::regclass);


--
-- Name: followers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followers ALTER COLUMN id SET DEFAULT nextval('public.followers_id_seq'::regclass);


--
-- Name: gift_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_transactions ALTER COLUMN id SET DEFAULT nextval('public.gift_transactions_id_seq'::regclass);


--
-- Name: gifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gifts ALTER COLUMN id SET DEFAULT nextval('public.gifts_id_seq'::regclass);


--
-- Name: hashtags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hashtags ALTER COLUMN id SET DEFAULT nextval('public.hashtags_id_seq'::regclass);


--
-- Name: highlights id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.highlights ALTER COLUMN id SET DEFAULT nextval('public.highlights_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: media_content_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_content_checks ALTER COLUMN id SET DEFAULT nextval('public.media_content_checks_id_seq'::regclass);


--
-- Name: media_moderation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_moderation ALTER COLUMN id SET DEFAULT nextval('public.media_moderation_id_seq'::regclass);


--
-- Name: menu_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: moderation_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_logs ALTER COLUMN id SET DEFAULT nextval('public.moderation_logs_id_seq'::regclass);


--
-- Name: moderation_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_settings ALTER COLUMN id SET DEFAULT nextval('public.moderation_settings_id_seq'::regclass);


--
-- Name: music_play_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_play_logs ALTER COLUMN id SET DEFAULT nextval('public.music_play_logs_id_seq'::regclass);


--
-- Name: music_tracks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_tracks ALTER COLUMN id SET DEFAULT nextval('public.music_tracks_id_seq'::regclass);


--
-- Name: music_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_usage ALTER COLUMN id SET DEFAULT nextval('public.music_usage_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: personal_access_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_access_tokens ALTER COLUMN id SET DEFAULT nextval('public.personal_access_tokens_id_seq'::regclass);


--
-- Name: playlist_videos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_videos ALTER COLUMN id SET DEFAULT nextval('public.playlist_videos_id_seq'::regclass);


--
-- Name: playlists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists ALTER COLUMN id SET DEFAULT nextval('public.playlists_id_seq'::regclass);


--
-- Name: profile_suggestion_dismissals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_dismissals ALTER COLUMN id SET DEFAULT nextval('public.profile_suggestion_dismissals_id_seq'::regclass);


--
-- Name: profile_suggestion_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_logs ALTER COLUMN id SET DEFAULT nextval('public.profile_suggestion_logs_id_seq'::regclass);


--
-- Name: profile_views id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views ALTER COLUMN id SET DEFAULT nextval('public.profile_views_id_seq'::regclass);


--
-- Name: profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles ALTER COLUMN id SET DEFAULT nextval('public.profiles_id_seq'::regclass);


--
-- Name: promotions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions ALTER COLUMN id SET DEFAULT nextval('public.promotions_id_seq'::regclass);


--
-- Name: rate_limits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits ALTER COLUMN id SET DEFAULT nextval('public.rate_limits_id_seq'::regclass);


--
-- Name: security_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_logs ALTER COLUMN id SET DEFAULT nextval('public.security_logs_id_seq'::regclass);


--
-- Name: signup_drafts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_drafts ALTER COLUMN id SET DEFAULT nextval('public.signup_drafts_id_seq'::regclass);


--
-- Name: social_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links ALTER COLUMN id SET DEFAULT nextval('public.social_links_id_seq'::regclass);


--
-- Name: stories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories ALTER COLUMN id SET DEFAULT nextval('public.stories_id_seq'::regclass);


--
-- Name: story_layers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_layers ALTER COLUMN id SET DEFAULT nextval('public.story_layers_id_seq'::regclass);


--
-- Name: story_media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_media ALTER COLUMN id SET DEFAULT nextval('public.story_media_id_seq'::regclass);


--
-- Name: story_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_messages ALTER COLUMN id SET DEFAULT nextval('public.story_messages_id_seq'::regclass);


--
-- Name: story_reactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reactions ALTER COLUMN id SET DEFAULT nextval('public.story_reactions_id_seq'::regclass);


--
-- Name: story_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reports ALTER COLUMN id SET DEFAULT nextval('public.story_reports_id_seq'::regclass);


--
-- Name: story_views id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_views ALTER COLUMN id SET DEFAULT nextval('public.story_views_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: user_admin_restrictions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_admin_restrictions ALTER COLUMN id SET DEFAULT nextval('public.user_admin_restrictions_id_seq'::regclass);


--
-- Name: user_devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices ALTER COLUMN id SET DEFAULT nextval('public.user_devices_id_seq'::regclass);


--
-- Name: user_hidden_words id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_words ALTER COLUMN id SET DEFAULT nextval('public.user_hidden_words_id_seq'::regclass);


--
-- Name: user_moderation_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_moderation_settings ALTER COLUMN id SET DEFAULT nextval('public.user_moderation_settings_id_seq'::regclass);


--
-- Name: user_permission_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permission_settings ALTER COLUMN id SET DEFAULT nextval('public.user_permission_settings_id_seq'::regclass);


--
-- Name: user_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports ALTER COLUMN id SET DEFAULT nextval('public.user_reports_id_seq'::regclass);


--
-- Name: user_video_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_video_preferences ALTER COLUMN id SET DEFAULT nextval('public.user_video_preferences_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: verification_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_requests ALTER COLUMN id SET DEFAULT nextval('public.verification_requests_id_seq'::regclass);


--
-- Name: video_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_comments ALTER COLUMN id SET DEFAULT nextval('public.video_comments_id_seq'::regclass);


--
-- Name: video_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_events ALTER COLUMN id SET DEFAULT nextval('public.video_events_id_seq'::regclass);


--
-- Name: video_hashtags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_hashtags ALTER COLUMN id SET DEFAULT nextval('public.video_hashtags_id_seq'::regclass);


--
-- Name: video_likes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_likes ALTER COLUMN id SET DEFAULT nextval('public.video_likes_id_seq'::regclass);


--
-- Name: video_monetization id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_monetization ALTER COLUMN id SET DEFAULT nextval('public.video_monetization_id_seq'::regclass);


--
-- Name: video_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_reports ALTER COLUMN id SET DEFAULT nextval('public.video_reports_id_seq'::regclass);


--
-- Name: video_saves id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_saves ALTER COLUMN id SET DEFAULT nextval('public.video_saves_id_seq'::regclass);


--
-- Name: video_scores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_scores ALTER COLUMN id SET DEFAULT nextval('public.video_scores_id_seq'::regclass);


--
-- Name: video_shares id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_shares ALTER COLUMN id SET DEFAULT nextval('public.video_shares_id_seq'::regclass);


--
-- Name: video_views id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_views ALTER COLUMN id SET DEFAULT nextval('public.video_views_id_seq'::regclass);


--
-- Name: video_watch_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_watch_events ALTER COLUMN id SET DEFAULT nextval('public.video_watch_events_id_seq'::regclass);


--
-- Name: video_watch_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_watch_sessions ALTER COLUMN id SET DEFAULT nextval('public.video_watch_sessions_id_seq'::regclass);


--
-- Name: videos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos ALTER COLUMN id SET DEFAULT nextval('public.videos_id_seq'::regclass);


--
-- Name: wallet_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions ALTER COLUMN id SET DEFAULT nextval('public.wallet_transactions_id_seq'::regclass);


--
-- Name: wallets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets ALTER COLUMN id SET DEFAULT nextval('public.wallets_id_seq'::regclass);


--
-- Name: account_deletion_requests account_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: admin_action_logs admin_action_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_logs
    ADD CONSTRAINT admin_action_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_coin_settings admin_coin_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_coin_settings
    ADD CONSTRAINT admin_coin_settings_key_unique UNIQUE (key);


--
-- Name: admin_coin_settings admin_coin_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_coin_settings
    ADD CONSTRAINT admin_coin_settings_pkey PRIMARY KEY (id);


--
-- Name: admin_commissions admin_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_commissions
    ADD CONSTRAINT admin_commissions_pkey PRIMARY KEY (id);


--
-- Name: admin_user_notes admin_user_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user_notes
    ADD CONSTRAINT admin_user_notes_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_key_unique UNIQUE (key);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: audio_favorites audio_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_favorites
    ADD CONSTRAINT audio_favorites_pkey PRIMARY KEY (id);


--
-- Name: audio_favorites audio_favorites_user_id_audio_track_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_favorites
    ADD CONSTRAINT audio_favorites_user_id_audio_track_id_unique UNIQUE (user_id, audio_track_id);


--
-- Name: audio_tracks audio_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_tracks
    ADD CONSTRAINT audio_tracks_pkey PRIMARY KEY (id);


--
-- Name: blocked_users blocked_users_blocker_id_blocked_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocker_id_blocked_id_unique UNIQUE (blocker_id, blocked_id);


--
-- Name: blocked_users blocked_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_pkey PRIMARY KEY (id);


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
-- Name: cms_pages cms_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_pkey PRIMARY KEY (id);


--
-- Name: cms_pages cms_pages_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_slug_unique UNIQUE (slug);


--
-- Name: coin_gifts coin_gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_gifts
    ADD CONSTRAINT coin_gifts_pkey PRIMARY KEY (id);


--
-- Name: coin_gifts coin_gifts_reference_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_gifts
    ADD CONSTRAINT coin_gifts_reference_id_unique UNIQUE (reference_id);


--
-- Name: coin_orders coin_orders_payment_reference_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_orders
    ADD CONSTRAINT coin_orders_payment_reference_unique UNIQUE (payment_reference);


--
-- Name: coin_orders coin_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_orders
    ADD CONSTRAINT coin_orders_pkey PRIMARY KEY (id);


--
-- Name: coin_packages coin_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_packages
    ADD CONSTRAINT coin_packages_pkey PRIMARY KEY (id);


--
-- Name: comment_likes comment_likes_comment_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_user_id_unique UNIQUE (comment_id, user_id);


--
-- Name: comment_likes comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (id);


--
-- Name: comment_mentions comment_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_mentions
    ADD CONSTRAINT comment_mentions_pkey PRIMARY KEY (id);


--
-- Name: comment_reactions comment_reactions_comment_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_comment_id_user_id_unique UNIQUE (comment_id, user_id);


--
-- Name: comment_reactions comment_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_pkey PRIMARY KEY (id);


--
-- Name: comment_reports comment_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reports
    ADD CONSTRAINT comment_reports_pkey PRIMARY KEY (id);


--
-- Name: comment_restricted_users comment_restricted_users_creator_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_restricted_users
    ADD CONSTRAINT comment_restricted_users_creator_id_user_id_unique UNIQUE (creator_id, user_id);


--
-- Name: comment_restricted_users comment_restricted_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_restricted_users
    ADD CONSTRAINT comment_restricted_users_pkey PRIMARY KEY (id);


--
-- Name: conversation_admin_logs conversation_admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_admin_logs
    ADD CONSTRAINT conversation_admin_logs_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_user_a_id_user_b_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_a_id_user_b_id_unique UNIQUE (user_a_id, user_b_id);


--
-- Name: country_admin_override_logs country_admin_override_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_admin_override_logs
    ADD CONSTRAINT country_admin_override_logs_pkey PRIMARY KEY (id);


--
-- Name: country_change_requests country_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_change_requests
    ADD CONSTRAINT country_change_requests_pkey PRIMARY KEY (id);


--
-- Name: country_detections country_detections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_detections
    ADD CONSTRAINT country_detections_pkey PRIMARY KEY (id);


--
-- Name: country_residency_documents country_residency_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_residency_documents
    ADD CONSTRAINT country_residency_documents_pkey PRIMARY KEY (id);


--
-- Name: creator_analytics creator_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_analytics
    ADD CONSTRAINT creator_analytics_pkey PRIMARY KEY (id);


--
-- Name: creator_analytics creator_analytics_user_id_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_analytics
    ADD CONSTRAINT creator_analytics_user_id_date_unique UNIQUE (user_id, date);


--
-- Name: creator_applications creator_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_pkey PRIMARY KEY (id);


--
-- Name: creator_applications creator_applications_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_user_id_unique UNIQUE (user_id);


--
-- Name: creator_earnings creator_earnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_earnings
    ADD CONSTRAINT creator_earnings_pkey PRIMARY KEY (id);


--
-- Name: creator_levels creator_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_levels
    ADD CONSTRAINT creator_levels_pkey PRIMARY KEY (id);


--
-- Name: creator_monetization_status creator_monetization_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_monetization_status
    ADD CONSTRAINT creator_monetization_status_pkey PRIMARY KEY (id);


--
-- Name: creator_monetization_status creator_monetization_status_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_monetization_status
    ADD CONSTRAINT creator_monetization_status_user_id_unique UNIQUE (user_id);


--
-- Name: creator_payout_methods creator_payout_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payout_methods
    ADD CONSTRAINT creator_payout_methods_pkey PRIMARY KEY (id);


--
-- Name: creator_payouts creator_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payouts
    ADD CONSTRAINT creator_payouts_pkey PRIMARY KEY (id);


--
-- Name: creator_progress creator_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_progress
    ADD CONSTRAINT creator_progress_pkey PRIMARY KEY (id);


--
-- Name: creator_progress creator_progress_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_progress
    ADD CONSTRAINT creator_progress_user_id_unique UNIQUE (user_id);


--
-- Name: creator_revenue_goals creator_revenue_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_revenue_goals
    ADD CONSTRAINT creator_revenue_goals_pkey PRIMARY KEY (id);


--
-- Name: creator_revenue_goals creator_revenue_goals_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_revenue_goals
    ADD CONSTRAINT creator_revenue_goals_user_id_unique UNIQUE (user_id);


--
-- Name: creator_wallets creator_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallets
    ADD CONSTRAINT creator_wallets_pkey PRIMARY KEY (id);


--
-- Name: creator_wallets creator_wallets_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallets
    ADD CONSTRAINT creator_wallets_user_id_unique UNIQUE (user_id);


--
-- Name: data_download_requests data_download_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_download_requests
    ADD CONSTRAINT data_download_requests_pkey PRIMARY KEY (id);


--
-- Name: direct_messages direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


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
-- Name: followers followers_follower_id_following_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_follower_id_following_id_unique UNIQUE (follower_id, following_id);


--
-- Name: followers followers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_pkey PRIMARY KEY (id);


--
-- Name: gift_transactions gift_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_pkey PRIMARY KEY (id);


--
-- Name: gifts gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gifts
    ADD CONSTRAINT gifts_pkey PRIMARY KEY (id);


--
-- Name: hashtags hashtags_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hashtags
    ADD CONSTRAINT hashtags_name_unique UNIQUE (name);


--
-- Name: hashtags hashtags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hashtags
    ADD CONSTRAINT hashtags_pkey PRIMARY KEY (id);


--
-- Name: highlights highlights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.highlights
    ADD CONSTRAINT highlights_pkey PRIMARY KEY (id);


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
-- Name: media_content_checks media_content_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_content_checks
    ADD CONSTRAINT media_content_checks_pkey PRIMARY KEY (id);


--
-- Name: media_moderation media_moderation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_moderation
    ADD CONSTRAINT media_moderation_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_key_unique UNIQUE (key);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: moderation_logs moderation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_logs
    ADD CONSTRAINT moderation_logs_pkey PRIMARY KEY (id);


--
-- Name: moderation_settings moderation_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_settings
    ADD CONSTRAINT moderation_settings_pkey PRIMARY KEY (id);


--
-- Name: music_play_logs music_play_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_play_logs
    ADD CONSTRAINT music_play_logs_pkey PRIMARY KEY (id);


--
-- Name: music_tracks music_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_tracks
    ADD CONSTRAINT music_tracks_pkey PRIMARY KEY (id);


--
-- Name: music_usage music_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_usage
    ADD CONSTRAINT music_usage_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


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
-- Name: playlist_videos playlist_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_videos
    ADD CONSTRAINT playlist_videos_pkey PRIMARY KEY (id);


--
-- Name: playlist_videos playlist_videos_playlist_id_video_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_videos
    ADD CONSTRAINT playlist_videos_playlist_id_video_id_unique UNIQUE (playlist_id, video_id);


--
-- Name: playlists playlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_pkey PRIMARY KEY (id);


--
-- Name: profile_suggestion_dismissals profile_suggestion_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_dismissals
    ADD CONSTRAINT profile_suggestion_dismissals_pkey PRIMARY KEY (id);


--
-- Name: profile_suggestion_dismissals profile_suggestion_dismissals_user_id_suggested_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_dismissals
    ADD CONSTRAINT profile_suggestion_dismissals_user_id_suggested_user_id_unique UNIQUE (user_id, suggested_user_id);


--
-- Name: profile_suggestion_logs profile_suggestion_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_logs
    ADD CONSTRAINT profile_suggestion_logs_pkey PRIMARY KEY (id);


--
-- Name: profile_views profile_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_identity_action_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_identity_action_unique UNIQUE (identifier, identifier_type, action_type);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: security_logs security_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_logs
    ADD CONSTRAINT security_logs_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: signup_drafts signup_drafts_draft_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_drafts
    ADD CONSTRAINT signup_drafts_draft_token_unique UNIQUE (draft_token);


--
-- Name: signup_drafts signup_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_drafts
    ADD CONSTRAINT signup_drafts_pkey PRIMARY KEY (id);


--
-- Name: social_links social_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links
    ADD CONSTRAINT social_links_pkey PRIMARY KEY (id);


--
-- Name: social_links social_links_user_id_platform_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links
    ADD CONSTRAINT social_links_user_id_platform_unique UNIQUE (user_id, platform);


--
-- Name: stories stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);


--
-- Name: story_layers story_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_layers
    ADD CONSTRAINT story_layers_pkey PRIMARY KEY (id);


--
-- Name: story_media story_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_media
    ADD CONSTRAINT story_media_pkey PRIMARY KEY (id);


--
-- Name: story_messages story_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_messages
    ADD CONSTRAINT story_messages_pkey PRIMARY KEY (id);


--
-- Name: story_reactions story_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reactions
    ADD CONSTRAINT story_reactions_pkey PRIMARY KEY (id);


--
-- Name: story_reactions story_reactions_story_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reactions
    ADD CONSTRAINT story_reactions_story_id_user_id_unique UNIQUE (story_id, user_id);


--
-- Name: story_reports story_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reports
    ADD CONSTRAINT story_reports_pkey PRIMARY KEY (id);


--
-- Name: story_reports story_reports_story_id_reporter_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reports
    ADD CONSTRAINT story_reports_story_id_reporter_id_unique UNIQUE (story_id, reporter_id);


--
-- Name: story_views story_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_views
    ADD CONSTRAINT story_views_pkey PRIMARY KEY (id);


--
-- Name: story_views story_views_story_id_viewer_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_views
    ADD CONSTRAINT story_views_story_id_viewer_id_unique UNIQUE (story_id, viewer_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: comment_mentions unique_mention_per_source; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_mentions
    ADD CONSTRAINT unique_mention_per_source UNIQUE (mentioned_user_id, source_type, source_id);


--
-- Name: user_admin_restrictions user_admin_restrictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_admin_restrictions
    ADD CONSTRAINT user_admin_restrictions_pkey PRIMARY KEY (id);


--
-- Name: user_admin_restrictions user_admin_restrictions_user_id_restriction_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_admin_restrictions
    ADD CONSTRAINT user_admin_restrictions_user_id_restriction_type_unique UNIQUE (user_id, restriction_type);


--
-- Name: user_devices user_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_pkey PRIMARY KEY (id);


--
-- Name: user_devices user_devices_user_id_device_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_user_id_device_token_unique UNIQUE (user_id, device_token);


--
-- Name: user_hidden_words user_hidden_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_words
    ADD CONSTRAINT user_hidden_words_pkey PRIMARY KEY (id);


--
-- Name: user_hidden_words user_hidden_words_user_id_word_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_words
    ADD CONSTRAINT user_hidden_words_user_id_word_unique UNIQUE (user_id, word);


--
-- Name: user_moderation_settings user_moderation_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_moderation_settings
    ADD CONSTRAINT user_moderation_settings_pkey PRIMARY KEY (id);


--
-- Name: user_moderation_settings user_moderation_settings_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_moderation_settings
    ADD CONSTRAINT user_moderation_settings_user_id_unique UNIQUE (user_id);


--
-- Name: user_permission_settings user_permission_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permission_settings
    ADD CONSTRAINT user_permission_settings_pkey PRIMARY KEY (id);


--
-- Name: user_permission_settings user_permission_settings_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permission_settings
    ADD CONSTRAINT user_permission_settings_user_id_unique UNIQUE (user_id);


--
-- Name: user_reports user_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_pkey PRIMARY KEY (id);


--
-- Name: user_video_preferences user_video_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_video_preferences
    ADD CONSTRAINT user_video_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_video_preferences user_video_preferences_user_id_pref_type_pref_value_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_video_preferences
    ADD CONSTRAINT user_video_preferences_user_id_pref_type_pref_value_unique UNIQUE (user_id, pref_type, pref_value);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_unique UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: verification_requests verification_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_pkey PRIMARY KEY (id);


--
-- Name: video_comments video_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_comments
    ADD CONSTRAINT video_comments_pkey PRIMARY KEY (id);


--
-- Name: video_events video_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_events
    ADD CONSTRAINT video_events_pkey PRIMARY KEY (id);


--
-- Name: video_hashtags video_hashtags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_hashtags
    ADD CONSTRAINT video_hashtags_pkey PRIMARY KEY (id);


--
-- Name: video_hashtags video_hashtags_video_id_hashtag_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_hashtags
    ADD CONSTRAINT video_hashtags_video_id_hashtag_id_unique UNIQUE (video_id, hashtag_id);


--
-- Name: video_likes video_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_likes
    ADD CONSTRAINT video_likes_pkey PRIMARY KEY (id);


--
-- Name: video_likes video_likes_video_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_likes
    ADD CONSTRAINT video_likes_video_id_user_id_unique UNIQUE (video_id, user_id);


--
-- Name: video_monetization video_monetization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_monetization
    ADD CONSTRAINT video_monetization_pkey PRIMARY KEY (id);


--
-- Name: video_reports video_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_reports
    ADD CONSTRAINT video_reports_pkey PRIMARY KEY (id);


--
-- Name: video_saves video_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_saves
    ADD CONSTRAINT video_saves_pkey PRIMARY KEY (id);


--
-- Name: video_saves video_saves_video_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_saves
    ADD CONSTRAINT video_saves_video_id_user_id_unique UNIQUE (video_id, user_id);


--
-- Name: video_scores video_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_scores
    ADD CONSTRAINT video_scores_pkey PRIMARY KEY (id);


--
-- Name: video_scores video_scores_video_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_scores
    ADD CONSTRAINT video_scores_video_id_unique UNIQUE (video_id);


--
-- Name: video_shares video_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_shares
    ADD CONSTRAINT video_shares_pkey PRIMARY KEY (id);


--
-- Name: video_views video_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_views
    ADD CONSTRAINT video_views_pkey PRIMARY KEY (id);


--
-- Name: video_watch_events video_watch_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_watch_events
    ADD CONSTRAINT video_watch_events_pkey PRIMARY KEY (id);


--
-- Name: video_watch_sessions video_watch_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_watch_sessions
    ADD CONSTRAINT video_watch_sessions_pkey PRIMARY KEY (id);


--
-- Name: video_watch_sessions video_watch_sessions_session_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_watch_sessions
    ADD CONSTRAINT video_watch_sessions_session_id_unique UNIQUE (session_id);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_unique UNIQUE (user_id);


--
-- Name: account_deletion_requests_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_deletion_requests_user_id_status_index ON public.account_deletion_requests USING btree (user_id, status);


--
-- Name: admin_action_logs_action_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_action_logs_action_index ON public.admin_action_logs USING btree (action);


--
-- Name: admin_action_logs_admin_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_action_logs_admin_id_index ON public.admin_action_logs USING btree (admin_id);


--
-- Name: admin_action_logs_category_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_action_logs_category_index ON public.admin_action_logs USING btree (category);


--
-- Name: admin_action_logs_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_action_logs_created_at_index ON public.admin_action_logs USING btree (created_at);


--
-- Name: admin_action_logs_target_type_target_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_action_logs_target_type_target_id_index ON public.admin_action_logs USING btree (target_type, target_id);


--
-- Name: admin_commissions_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_commissions_created_at_index ON public.admin_commissions USING btree (created_at);


--
-- Name: admin_commissions_source_type_source_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_commissions_source_type_source_id_index ON public.admin_commissions USING btree (source_type, source_id);


--
-- Name: coin_gifts_receiver_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coin_gifts_receiver_id_created_at_index ON public.coin_gifts USING btree (receiver_id, created_at);


--
-- Name: coin_gifts_reference_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coin_gifts_reference_id_index ON public.coin_gifts USING btree (reference_id);


--
-- Name: coin_gifts_sender_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coin_gifts_sender_id_created_at_index ON public.coin_gifts USING btree (sender_id, created_at);


--
-- Name: coin_orders_payment_reference_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coin_orders_payment_reference_index ON public.coin_orders USING btree (payment_reference);


--
-- Name: coin_orders_user_id_payment_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coin_orders_user_id_payment_status_index ON public.coin_orders USING btree (user_id, payment_status);


--
-- Name: coin_packages_is_active_sort_order_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coin_packages_is_active_sort_order_index ON public.coin_packages USING btree (is_active, sort_order);


--
-- Name: coin_packages_is_front_visible_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coin_packages_is_front_visible_index ON public.coin_packages USING btree (is_front_visible);


--
-- Name: comment_mentions_mentioned_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_mentions_mentioned_user_id_index ON public.comment_mentions USING btree (mentioned_user_id);


--
-- Name: comment_mentions_source_type_source_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_mentions_source_type_source_id_index ON public.comment_mentions USING btree (source_type, source_id);


--
-- Name: comment_reactions_comment_id_reaction_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_reactions_comment_id_reaction_type_index ON public.comment_reactions USING btree (comment_id, reaction_type);


--
-- Name: comment_reports_comment_id_reporter_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_reports_comment_id_reporter_user_id_index ON public.comment_reports USING btree (comment_id, reporter_user_id);


--
-- Name: comment_reports_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_reports_status_index ON public.comment_reports USING btree (status);


--
-- Name: comment_restricted_users_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_restricted_users_user_id_index ON public.comment_restricted_users USING btree (user_id);


--
-- Name: conversation_admin_logs_conversation_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_admin_logs_conversation_id_index ON public.conversation_admin_logs USING btree (conversation_id);


--
-- Name: conversations_received_by_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_received_by_index ON public.conversations USING btree (received_by);


--
-- Name: conversations_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_status_index ON public.conversations USING btree (status);


--
-- Name: country_admin_override_logs_admin_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_admin_override_logs_admin_id_index ON public.country_admin_override_logs USING btree (admin_id);


--
-- Name: country_admin_override_logs_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_admin_override_logs_user_id_index ON public.country_admin_override_logs USING btree (user_id);


--
-- Name: country_change_requests_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_change_requests_user_id_status_index ON public.country_change_requests USING btree (user_id, status);


--
-- Name: country_detections_user_id_detected_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_detections_user_id_detected_at_index ON public.country_detections USING btree (user_id, detected_at);


--
-- Name: country_detections_user_id_detected_country_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_detections_user_id_detected_country_code_index ON public.country_detections USING btree (user_id, detected_country_code);


--
-- Name: country_residency_documents_requested_country_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_residency_documents_requested_country_code_index ON public.country_residency_documents USING btree (requested_country_code);


--
-- Name: country_residency_documents_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_residency_documents_user_id_status_index ON public.country_residency_documents USING btree (user_id, status);


--
-- Name: creator_earnings_user_id_earned_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_earnings_user_id_earned_at_index ON public.creator_earnings USING btree (user_id, earned_at);


--
-- Name: creator_earnings_user_id_source_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_earnings_user_id_source_index ON public.creator_earnings USING btree (user_id, source);


--
-- Name: creator_earnings_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_earnings_user_id_status_index ON public.creator_earnings USING btree (user_id, status);


--
-- Name: creator_earnings_user_id_video_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_earnings_user_id_video_id_index ON public.creator_earnings USING btree (user_id, video_id);


--
-- Name: creator_payout_methods_user_id_is_default_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_payout_methods_user_id_is_default_index ON public.creator_payout_methods USING btree (user_id, is_default);


--
-- Name: creator_payouts_user_id_scheduled_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_payouts_user_id_scheduled_at_index ON public.creator_payouts USING btree (user_id, scheduled_at);


--
-- Name: creator_payouts_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_payouts_user_id_status_index ON public.creator_payouts USING btree (user_id, status);


--
-- Name: data_download_requests_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX data_download_requests_user_id_status_index ON public.data_download_requests USING btree (user_id, status);


--
-- Name: direct_messages_conversation_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX direct_messages_conversation_id_index ON public.direct_messages USING btree (conversation_id);


--
-- Name: direct_messages_receiver_id_read_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX direct_messages_receiver_id_read_at_index ON public.direct_messages USING btree (receiver_id, read_at);


--
-- Name: direct_messages_sender_id_receiver_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX direct_messages_sender_id_receiver_id_created_at_index ON public.direct_messages USING btree (sender_id, receiver_id, created_at);


--
-- Name: email_verification_tokens_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_email_index ON public.email_verification_tokens USING btree (email);


--
-- Name: jobs_queue_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_queue_index ON public.jobs USING btree (queue);


--
-- Name: media_content_checks_upload_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_content_checks_upload_id_index ON public.media_content_checks USING btree (upload_id);


--
-- Name: media_content_checks_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_content_checks_user_id_status_index ON public.media_content_checks USING btree (user_id, status);


--
-- Name: media_content_checks_video_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_content_checks_video_id_status_index ON public.media_content_checks USING btree (video_id, status);


--
-- Name: media_moderation_content_id_content_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_moderation_content_id_content_type_index ON public.media_moderation USING btree (content_id, content_type);


--
-- Name: media_moderation_decision_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_moderation_decision_index ON public.media_moderation USING btree (decision);


--
-- Name: media_moderation_scan_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_moderation_scan_status_index ON public.media_moderation USING btree (scan_status);


--
-- Name: media_moderation_scanned_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_moderation_scanned_at_index ON public.media_moderation USING btree (scanned_at);


--
-- Name: media_moderation_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_moderation_user_id_index ON public.media_moderation USING btree (user_id);


--
-- Name: moderation_logs_action_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_logs_action_type_index ON public.moderation_logs USING btree (action_type);


--
-- Name: moderation_logs_admin_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_logs_admin_id_index ON public.moderation_logs USING btree (admin_id);


--
-- Name: moderation_logs_content_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_logs_content_id_index ON public.moderation_logs USING btree (content_id);


--
-- Name: moderation_logs_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_logs_created_at_index ON public.moderation_logs USING btree (created_at);


--
-- Name: music_play_logs_track_id_played_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_play_logs_track_id_played_at_index ON public.music_play_logs USING btree (track_id, played_at);


--
-- Name: music_tracks_genre_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_tracks_genre_index ON public.music_tracks USING btree (genre);


--
-- Name: music_tracks_mood_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_tracks_mood_index ON public.music_tracks USING btree (mood);


--
-- Name: music_tracks_source_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_tracks_source_type_index ON public.music_tracks USING btree (source_type);


--
-- Name: music_tracks_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_tracks_status_index ON public.music_tracks USING btree (status);


--
-- Name: music_tracks_status_show_in_studio_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_tracks_status_show_in_studio_index ON public.music_tracks USING btree (status, show_in_studio);


--
-- Name: music_tracks_status_show_in_upload_picker_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_tracks_status_show_in_upload_picker_index ON public.music_tracks USING btree (status, show_in_upload_picker);


--
-- Name: music_usage_track_id_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_usage_track_id_user_id_index ON public.music_usage USING btree (track_id, user_id);


--
-- Name: music_usage_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_usage_user_id_index ON public.music_usage USING btree (user_id);


--
-- Name: notifications_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_at_index ON public.notifications USING btree (created_at);


--
-- Name: notifications_user_id_is_read_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_id_is_read_index ON public.notifications USING btree (user_id, is_read);


--
-- Name: personal_access_tokens_tokenable_type_tokenable_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX personal_access_tokens_tokenable_type_tokenable_id_index ON public.personal_access_tokens USING btree (tokenable_type, tokenable_id);


--
-- Name: playlist_videos_playlist_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playlist_videos_playlist_id_index ON public.playlist_videos USING btree (playlist_id);


--
-- Name: playlists_is_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playlists_is_active_index ON public.playlists USING btree (is_active);


--
-- Name: playlists_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playlists_type_index ON public.playlists USING btree (type);


--
-- Name: playlists_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playlists_user_id_index ON public.playlists USING btree (user_id);


--
-- Name: profile_suggestion_dismissals_user_id_dismissed_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_suggestion_dismissals_user_id_dismissed_at_index ON public.profile_suggestion_dismissals USING btree (user_id, dismissed_at);


--
-- Name: profile_suggestion_logs_followed_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_suggestion_logs_followed_at_index ON public.profile_suggestion_logs USING btree (followed_at);


--
-- Name: profile_suggestion_logs_user_id_context_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_suggestion_logs_user_id_context_index ON public.profile_suggestion_logs USING btree (user_id, context);


--
-- Name: profile_suggestion_logs_user_id_shown_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_suggestion_logs_user_id_shown_at_index ON public.profile_suggestion_logs USING btree (user_id, shown_at);


--
-- Name: profile_views_profile_user_id_viewed_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_views_profile_user_id_viewed_at_index ON public.profile_views USING btree (profile_user_id, viewed_at);


--
-- Name: rate_limits_action_type_blocked_until_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limits_action_type_blocked_until_index ON public.rate_limits USING btree (action_type, blocked_until);


--
-- Name: rate_limits_identifier_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limits_identifier_index ON public.rate_limits USING btree (identifier);


--
-- Name: security_logs_action_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX security_logs_action_created_at_index ON public.security_logs USING btree (action, created_at);


--
-- Name: security_logs_identifier_type_identifier_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX security_logs_identifier_type_identifier_index ON public.security_logs USING btree (identifier_type, identifier);


--
-- Name: security_logs_ip_address_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX security_logs_ip_address_index ON public.security_logs USING btree (ip_address);


--
-- Name: sessions_last_activity_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_last_activity_index ON public.sessions USING btree (last_activity);


--
-- Name: sessions_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_index ON public.sessions USING btree (user_id);


--
-- Name: signup_drafts_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signup_drafts_email_index ON public.signup_drafts USING btree (email);


--
-- Name: signup_drafts_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signup_drafts_user_id_index ON public.signup_drafts USING btree (user_id);


--
-- Name: stories_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_expires_at_index ON public.stories USING btree (expires_at);


--
-- Name: stories_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_user_id_status_index ON public.stories USING btree (user_id, status);


--
-- Name: story_layers_story_id_slide_index_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_layers_story_id_slide_index_index ON public.story_layers USING btree (story_id, slide_index);


--
-- Name: story_media_story_id_order_index_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_media_story_id_order_index_index ON public.story_media USING btree (story_id, order_index);


--
-- Name: subscriptions_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_user_id_status_index ON public.subscriptions USING btree (user_id, status);


--
-- Name: user_admin_restrictions_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_admin_restrictions_expires_at_index ON public.user_admin_restrictions USING btree (expires_at);


--
-- Name: user_admin_restrictions_is_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_admin_restrictions_is_active_index ON public.user_admin_restrictions USING btree (is_active);


--
-- Name: user_hidden_words_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_hidden_words_user_id_index ON public.user_hidden_words USING btree (user_id);


--
-- Name: user_reports_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_reports_status_index ON public.user_reports USING btree (status);


--
-- Name: user_video_preferences_user_id_pref_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_video_preferences_user_id_pref_type_index ON public.user_video_preferences USING btree (user_id, pref_type);


--
-- Name: user_video_preferences_user_id_weight_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_video_preferences_user_id_weight_index ON public.user_video_preferences USING btree (user_id, weight);


--
-- Name: users_country_locked_until_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_country_locked_until_index ON public.users USING btree (country_locked_until);


--
-- Name: users_detected_country_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_detected_country_code_index ON public.users USING btree (detected_country_code);


--
-- Name: users_is_banned_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_is_banned_index ON public.users USING btree (is_banned);


--
-- Name: users_role_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_role_index ON public.users USING btree (role);


--
-- Name: users_selected_country_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_selected_country_code_index ON public.users USING btree (selected_country_code);


--
-- Name: users_trust_score_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_trust_score_index ON public.users USING btree (trust_score);


--
-- Name: verification_requests_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_requests_status_index ON public.verification_requests USING btree (status);


--
-- Name: video_comments_held_for_review_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_comments_held_for_review_index ON public.video_comments USING btree (held_for_review);


--
-- Name: video_comments_is_spam_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_comments_is_spam_index ON public.video_comments USING btree (is_spam);


--
-- Name: video_comments_parent_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_comments_parent_id_index ON public.video_comments USING btree (parent_id);


--
-- Name: video_comments_root_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_comments_root_id_index ON public.video_comments USING btree (root_id);


--
-- Name: video_comments_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_comments_user_id_index ON public.video_comments USING btree (user_id);


--
-- Name: video_comments_video_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_comments_video_id_index ON public.video_comments USING btree (video_id);


--
-- Name: video_events_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_events_created_at_index ON public.video_events USING btree (created_at);


--
-- Name: video_events_user_id_event_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_events_user_id_event_type_index ON public.video_events USING btree (user_id, event_type);


--
-- Name: video_events_video_id_event_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_events_video_id_event_type_index ON public.video_events USING btree (video_id, event_type);


--
-- Name: video_hashtags_country_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_hashtags_country_code_index ON public.video_hashtags USING btree (country_code);


--
-- Name: video_hashtags_country_name_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_hashtags_country_name_index ON public.video_hashtags USING btree (country_name);


--
-- Name: video_reports_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_reports_status_index ON public.video_reports USING btree (status);


--
-- Name: video_reports_video_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_reports_video_id_index ON public.video_reports USING btree (video_id);


--
-- Name: video_scores_computed_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_scores_computed_at_index ON public.video_scores USING btree (computed_at);


--
-- Name: video_scores_score_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_scores_score_index ON public.video_scores USING btree (score);


--
-- Name: video_views_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_views_created_at_index ON public.video_views USING btree (created_at);


--
-- Name: video_views_video_id_device_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_views_video_id_device_type_index ON public.video_views USING btree (video_id, device_type);


--
-- Name: video_views_video_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_views_video_id_index ON public.video_views USING btree (video_id);


--
-- Name: video_views_video_id_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_views_video_id_user_id_index ON public.video_views USING btree (video_id, user_id);


--
-- Name: video_watch_events_session_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_watch_events_session_id_index ON public.video_watch_events USING btree (session_id);


--
-- Name: video_watch_sessions_video_id_ip_hash_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_watch_sessions_video_id_ip_hash_index ON public.video_watch_sessions USING btree (video_id, ip_hash);


--
-- Name: video_watch_sessions_video_id_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_watch_sessions_video_id_user_id_index ON public.video_watch_sessions USING btree (video_id, user_id);


--
-- Name: video_watch_sessions_video_id_view_counted_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_watch_sessions_video_id_view_counted_index ON public.video_watch_sessions USING btree (video_id, view_counted);


--
-- Name: videos_audio_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_audio_type_index ON public.videos USING btree (audio_type);


--
-- Name: videos_content_check_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_content_check_status_index ON public.videos USING btree (content_check_status);


--
-- Name: videos_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_created_at_index ON public.videos USING btree (created_at);


--
-- Name: videos_is_flagged_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_is_flagged_index ON public.videos USING btree (is_flagged);


--
-- Name: videos_moderation_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_moderation_status_index ON public.videos USING btree (moderation_status);


--
-- Name: videos_status_deleted_at_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_status_deleted_at_created_at_index ON public.videos USING btree (status, deleted_at, created_at);


--
-- Name: videos_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_status_index ON public.videos USING btree (status);


--
-- Name: videos_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_user_id_index ON public.videos USING btree (user_id);


--
-- Name: videos_user_id_status_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_user_id_status_created_at_index ON public.videos USING btree (user_id, status, created_at);


--
-- Name: account_deletion_requests account_deletion_requests_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_action_logs admin_action_logs_admin_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_logs
    ADD CONSTRAINT admin_action_logs_admin_id_foreign FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_commissions admin_commissions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_commissions
    ADD CONSTRAINT admin_commissions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_user_notes admin_user_notes_admin_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user_notes
    ADD CONSTRAINT admin_user_notes_admin_id_foreign FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_user_notes admin_user_notes_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user_notes
    ADD CONSTRAINT admin_user_notes_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: audio_favorites audio_favorites_audio_track_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_favorites
    ADD CONSTRAINT audio_favorites_audio_track_id_foreign FOREIGN KEY (audio_track_id) REFERENCES public.audio_tracks(id) ON DELETE CASCADE;


--
-- Name: audio_favorites audio_favorites_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_favorites
    ADD CONSTRAINT audio_favorites_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: blocked_users blocked_users_blocked_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocked_id_foreign FOREIGN KEY (blocked_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: blocked_users blocked_users_blocker_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocker_id_foreign FOREIGN KEY (blocker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cms_pages cms_pages_updated_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_updated_by_foreign FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: coin_gifts coin_gifts_receiver_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_gifts
    ADD CONSTRAINT coin_gifts_receiver_id_foreign FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: coin_gifts coin_gifts_sender_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_gifts
    ADD CONSTRAINT coin_gifts_sender_id_foreign FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: coin_orders coin_orders_package_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_orders
    ADD CONSTRAINT coin_orders_package_id_foreign FOREIGN KEY (package_id) REFERENCES public.coin_packages(id) ON DELETE RESTRICT;


--
-- Name: coin_orders coin_orders_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_orders
    ADD CONSTRAINT coin_orders_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_comment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_foreign FOREIGN KEY (comment_id) REFERENCES public.video_comments(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_mentions comment_mentions_mentioned_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_mentions
    ADD CONSTRAINT comment_mentions_mentioned_by_user_id_foreign FOREIGN KEY (mentioned_by_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_mentions comment_mentions_mentioned_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_mentions
    ADD CONSTRAINT comment_mentions_mentioned_user_id_foreign FOREIGN KEY (mentioned_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_reactions comment_reactions_comment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_comment_id_foreign FOREIGN KEY (comment_id) REFERENCES public.video_comments(id) ON DELETE CASCADE;


--
-- Name: comment_reactions comment_reactions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_reports comment_reports_comment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reports
    ADD CONSTRAINT comment_reports_comment_id_foreign FOREIGN KEY (comment_id) REFERENCES public.video_comments(id) ON DELETE CASCADE;


--
-- Name: comment_reports comment_reports_reporter_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reports
    ADD CONSTRAINT comment_reports_reporter_user_id_foreign FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_restricted_users comment_restricted_users_creator_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_restricted_users
    ADD CONSTRAINT comment_restricted_users_creator_id_foreign FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_restricted_users comment_restricted_users_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_restricted_users
    ADD CONSTRAINT comment_restricted_users_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversation_admin_logs conversation_admin_logs_conversation_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_admin_logs
    ADD CONSTRAINT conversation_admin_logs_conversation_id_foreign FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_initiated_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_initiated_by_foreign FOREIGN KEY (initiated_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_a_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_a_id_foreign FOREIGN KEY (user_a_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_b_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_b_id_foreign FOREIGN KEY (user_b_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: country_admin_override_logs country_admin_override_logs_admin_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_admin_override_logs
    ADD CONSTRAINT country_admin_override_logs_admin_id_foreign FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: country_admin_override_logs country_admin_override_logs_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_admin_override_logs
    ADD CONSTRAINT country_admin_override_logs_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: country_change_requests country_change_requests_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_change_requests
    ADD CONSTRAINT country_change_requests_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: country_detections country_detections_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_detections
    ADD CONSTRAINT country_detections_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: country_residency_documents country_residency_documents_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_residency_documents
    ADD CONSTRAINT country_residency_documents_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_analytics creator_analytics_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_analytics
    ADD CONSTRAINT creator_analytics_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_applications creator_applications_reviewed_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_reviewed_by_foreign FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: creator_applications creator_applications_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_applications
    ADD CONSTRAINT creator_applications_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_earnings creator_earnings_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_earnings
    ADD CONSTRAINT creator_earnings_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_earnings creator_earnings_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_earnings
    ADD CONSTRAINT creator_earnings_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: creator_monetization_status creator_monetization_status_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_monetization_status
    ADD CONSTRAINT creator_monetization_status_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_payout_methods creator_payout_methods_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payout_methods
    ADD CONSTRAINT creator_payout_methods_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_payouts creator_payouts_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_payouts
    ADD CONSTRAINT creator_payouts_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_progress creator_progress_current_level_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_progress
    ADD CONSTRAINT creator_progress_current_level_id_foreign FOREIGN KEY (current_level_id) REFERENCES public.creator_levels(id);


--
-- Name: creator_progress creator_progress_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_progress
    ADD CONSTRAINT creator_progress_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_revenue_goals creator_revenue_goals_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_revenue_goals
    ADD CONSTRAINT creator_revenue_goals_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: creator_wallets creator_wallets_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_wallets
    ADD CONSTRAINT creator_wallets_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: data_download_requests data_download_requests_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_download_requests
    ADD CONSTRAINT data_download_requests_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_conversation_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_conversation_id_foreign FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: direct_messages direct_messages_receiver_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_receiver_id_foreign FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_sender_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_sender_id_foreign FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: followers followers_follower_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_follower_id_foreign FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: followers followers_following_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followers
    ADD CONSTRAINT followers_following_id_foreign FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: gift_transactions gift_transactions_gift_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_gift_id_foreign FOREIGN KEY (gift_id) REFERENCES public.gifts(id);


--
-- Name: gift_transactions gift_transactions_receiver_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_receiver_id_foreign FOREIGN KEY (receiver_id) REFERENCES public.users(id);


--
-- Name: gift_transactions gift_transactions_sender_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_transactions
    ADD CONSTRAINT gift_transactions_sender_id_foreign FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: highlights highlights_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.highlights
    ADD CONSTRAINT highlights_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: media_content_checks media_content_checks_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_content_checks
    ADD CONSTRAINT media_content_checks_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: media_content_checks media_content_checks_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_content_checks
    ADD CONSTRAINT media_content_checks_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: media_moderation media_moderation_admin_reviewed_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_moderation
    ADD CONSTRAINT media_moderation_admin_reviewed_by_foreign FOREIGN KEY (admin_reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: menu_items menu_items_parent_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: music_play_logs music_play_logs_track_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_play_logs
    ADD CONSTRAINT music_play_logs_track_id_foreign FOREIGN KEY (track_id) REFERENCES public.music_tracks(id) ON DELETE CASCADE;


--
-- Name: music_usage music_usage_track_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_usage
    ADD CONSTRAINT music_usage_track_id_foreign FOREIGN KEY (track_id) REFERENCES public.music_tracks(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_foreign FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: playlist_videos playlist_videos_playlist_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_videos
    ADD CONSTRAINT playlist_videos_playlist_id_foreign FOREIGN KEY (playlist_id) REFERENCES public.playlists(id) ON DELETE CASCADE;


--
-- Name: playlist_videos playlist_videos_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_videos
    ADD CONSTRAINT playlist_videos_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: playlists playlists_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_suggestion_dismissals profile_suggestion_dismissals_suggested_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_dismissals
    ADD CONSTRAINT profile_suggestion_dismissals_suggested_user_id_foreign FOREIGN KEY (suggested_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_suggestion_dismissals profile_suggestion_dismissals_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_dismissals
    ADD CONSTRAINT profile_suggestion_dismissals_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_suggestion_logs profile_suggestion_logs_suggested_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_logs
    ADD CONSTRAINT profile_suggestion_logs_suggested_user_id_foreign FOREIGN KEY (suggested_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_suggestion_logs profile_suggestion_logs_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_suggestion_logs
    ADD CONSTRAINT profile_suggestion_logs_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_views profile_views_profile_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_profile_user_id_foreign FOREIGN KEY (profile_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profile_views profile_views_viewer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_viewer_id_foreign FOREIGN KEY (viewer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: promotions promotions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: promotions promotions_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: social_links social_links_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links
    ADD CONSTRAINT social_links_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: stories stories_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: story_layers story_layers_mentioned_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_layers
    ADD CONSTRAINT story_layers_mentioned_user_id_foreign FOREIGN KEY (mentioned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: story_layers story_layers_story_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_layers
    ADD CONSTRAINT story_layers_story_id_foreign FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


--
-- Name: story_media story_media_shared_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_media
    ADD CONSTRAINT story_media_shared_video_id_foreign FOREIGN KEY (shared_video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: story_media story_media_story_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_media
    ADD CONSTRAINT story_media_story_id_foreign FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


--
-- Name: story_messages story_messages_receiver_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_messages
    ADD CONSTRAINT story_messages_receiver_id_foreign FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: story_messages story_messages_sender_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_messages
    ADD CONSTRAINT story_messages_sender_id_foreign FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: story_messages story_messages_story_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_messages
    ADD CONSTRAINT story_messages_story_id_foreign FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


--
-- Name: story_reactions story_reactions_story_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reactions
    ADD CONSTRAINT story_reactions_story_id_foreign FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


--
-- Name: story_reactions story_reactions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reactions
    ADD CONSTRAINT story_reactions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: story_reports story_reports_reporter_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reports
    ADD CONSTRAINT story_reports_reporter_id_foreign FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: story_reports story_reports_story_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_reports
    ADD CONSTRAINT story_reports_story_id_foreign FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


--
-- Name: story_views story_views_story_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_views
    ADD CONSTRAINT story_views_story_id_foreign FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


--
-- Name: story_views story_views_viewer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_views
    ADD CONSTRAINT story_views_viewer_id_foreign FOREIGN KEY (viewer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_admin_restrictions user_admin_restrictions_created_by_admin_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_admin_restrictions
    ADD CONSTRAINT user_admin_restrictions_created_by_admin_id_foreign FOREIGN KEY (created_by_admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_admin_restrictions user_admin_restrictions_updated_by_admin_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_admin_restrictions
    ADD CONSTRAINT user_admin_restrictions_updated_by_admin_id_foreign FOREIGN KEY (updated_by_admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_admin_restrictions user_admin_restrictions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_admin_restrictions
    ADD CONSTRAINT user_admin_restrictions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_devices user_devices_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_hidden_words user_hidden_words_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_hidden_words
    ADD CONSTRAINT user_hidden_words_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_moderation_settings user_moderation_settings_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_moderation_settings
    ADD CONSTRAINT user_moderation_settings_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_permission_settings user_permission_settings_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permission_settings
    ADD CONSTRAINT user_permission_settings_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_reports user_reports_reported_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reported_user_id_foreign FOREIGN KEY (reported_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_reports user_reports_reporter_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reporter_id_foreign FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_reports user_reports_reviewed_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reviewed_by_foreign FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_video_preferences user_video_preferences_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_video_preferences
    ADD CONSTRAINT user_video_preferences_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: verification_requests verification_requests_reviewed_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_reviewed_by_foreign FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: verification_requests verification_requests_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_comments video_comments_parent_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_comments
    ADD CONSTRAINT video_comments_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES public.video_comments(id) ON DELETE CASCADE;


--
-- Name: video_comments video_comments_pinned_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_comments
    ADD CONSTRAINT video_comments_pinned_by_foreign FOREIGN KEY (pinned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: video_comments video_comments_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_comments
    ADD CONSTRAINT video_comments_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_comments video_comments_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_comments
    ADD CONSTRAINT video_comments_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_events video_events_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_events
    ADD CONSTRAINT video_events_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_hashtags video_hashtags_hashtag_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_hashtags
    ADD CONSTRAINT video_hashtags_hashtag_id_foreign FOREIGN KEY (hashtag_id) REFERENCES public.hashtags(id) ON DELETE CASCADE;


--
-- Name: video_hashtags video_hashtags_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_hashtags
    ADD CONSTRAINT video_hashtags_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_likes video_likes_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_likes
    ADD CONSTRAINT video_likes_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_likes video_likes_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_likes
    ADD CONSTRAINT video_likes_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_monetization video_monetization_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_monetization
    ADD CONSTRAINT video_monetization_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_reports video_reports_reporter_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_reports
    ADD CONSTRAINT video_reports_reporter_id_foreign FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_reports video_reports_reviewed_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_reports
    ADD CONSTRAINT video_reports_reviewed_by_foreign FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: video_reports video_reports_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_reports
    ADD CONSTRAINT video_reports_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_saves video_saves_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_saves
    ADD CONSTRAINT video_saves_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_saves video_saves_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_saves
    ADD CONSTRAINT video_saves_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_scores video_scores_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_scores
    ADD CONSTRAINT video_scores_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_shares video_shares_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_shares
    ADD CONSTRAINT video_shares_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_views video_views_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_views
    ADD CONSTRAINT video_views_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_watch_events video_watch_events_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_watch_events
    ADD CONSTRAINT video_watch_events_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: video_watch_sessions video_watch_sessions_video_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_watch_sessions
    ADD CONSTRAINT video_watch_sessions_video_id_foreign FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: videos videos_deleted_by_admin_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_deleted_by_admin_id_foreign FOREIGN KEY (deleted_by_admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: videos videos_deleted_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_deleted_by_user_id_foreign FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: videos videos_restored_by_admin_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_restored_by_admin_id_foreign FOREIGN KEY (restored_by_admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: videos videos_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wallet_transactions wallet_transactions_wallet_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_wallet_id_foreign FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- Name: wallets wallets_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict TDvoQhpi4SXMVyN3FKyrfs7T9G7EUU6QXDioN0iCTjxhV5yej0ByYWSOUR1A1HI

--
-- PostgreSQL database dump
--

\restrict F5MDw1lY77MjLKiIxb1tc5fCn6TdCuyOGLAn3SophEyHSG0fwOyNSJOF8SXPNFh

-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

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

--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.migrations (id, migration, batch) FROM stdin;
1	0001_01_01_000000_create_users_table	1
2	0001_01_01_000001_create_cache_table	1
3	0001_01_01_000002_create_jobs_table	1
4	0001_01_01_000003_create_sessions_table	1
5	0001_01_01_000004_create_personal_access_tokens_table	1
6	2025_05_24_000001_create_creator_levels_table	1
7	2025_05_24_000002_create_profiles_table	1
8	2025_05_24_000003_create_social_links_table	1
9	2025_05_24_000004_create_audio_tracks_table	1
10	2025_05_24_000005_create_videos_table	1
11	2025_05_24_000006_create_video_likes_table	1
12	2025_05_24_000007_create_video_comments_table	1
13	2025_05_24_000008_create_comment_likes_table	1
14	2025_05_24_000009_create_video_saves_table	1
15	2025_05_24_000010_create_video_shares_table	1
16	2025_05_24_000011_create_video_views_table	1
17	2025_05_24_000012_create_followers_table	1
18	2025_05_24_000013_create_blocked_users_table	1
19	2025_05_24_000014_create_hashtags_table	1
20	2025_05_24_000015_create_highlights_table	1
21	2025_05_24_000016_create_video_reports_table	1
22	2025_05_24_000017_create_user_reports_table	1
23	2025_05_24_000018_create_notifications_table	1
24	2025_05_24_000019_create_user_devices_table	1
25	2025_05_24_000020_create_verification_requests_table	1
26	2025_05_24_000021_create_creator_progress_table	1
27	2025_05_24_000022_create_creator_analytics_table	1
28	2025_05_24_000023_create_wallets_table	1
29	2025_05_24_000024_create_gifts_table	1
30	2025_05_24_000025_create_subscriptions_table	1
31	2025_05_24_000026_add_email_verified_at_to_users	1
32	2025_05_24_000027_create_admin_action_logs_table	1
33	2025_05_24_000028_create_app_settings_table	1
34	2025_05_24_000029_create_playlists_table	1
35	2025_05_24_000030_create_playlist_videos_table	1
36	2026_05_24_000001_add_r2_fields_to_videos_and_verifications	1
37	2026_05_27_000001_add_harassment_to_video_reports_reason	1
38	2026_05_27_000002_create_email_verification_tokens_table	1
39	2026_05_28_000001_add_media_items_to_videos	1
40	2026_05_28_100001_add_country_module_to_users	1
41	2026_05_28_100002_create_country_detections_table	1
42	2026_05_28_100003_create_country_change_requests_table	1
43	2026_05_28_100004_create_country_admin_override_logs_table	1
44	2026_05_28_200001_add_moderation_status_to_videos_table	1
45	2026_05_28_200002_create_media_moderation_table	1
46	2026_05_28_200003_create_moderation_logs_table	1
47	2026_05_28_200004_create_moderation_settings_table	1
48	2026_05_29_000001_add_account_settings_fields_to_users	1
49	2026_05_29_000002_add_categories_to_users	1
50	2026_05_29_100001_create_country_residency_documents_table	1
51	2026_05_29_200001_fix_social_links_platform_column	1
52	2026_05_29_300001_add_location_detail_to_users	1
53	2026_05_29_400001_add_pin_fields_to_videos_table	1
54	2026_05_30_100001_create_direct_messages_table	1
55	2026_05_30_100001_create_feature_flags_and_cms_tables	1
56	2026_05_30_200001_add_media_fields_to_direct_messages	1
57	2026_05_30_300001_create_user_360_tables	1
58	2026_05_31_100001_add_quality_urls_to_videos_table	1
59	2026_05_31_200001_create_profile_views_table	1
60	2026_06_01_100001_add_metadata_to_videos_table	1
61	2026_06_01_200001_add_source_country_to_video_views	1
62	2026_06_01_210001_add_country_fields_to_video_hashtags	1
63	2026_06_02_100001_create_video_events_table	1
64	2026_06_02_100002_create_video_scores_table	1
65	2026_06_02_100003_create_user_video_preferences_table	1
66	2026_06_02_200001_add_is_ai_generated_to_videos_table	1
67	2026_06_02_200002_add_unlisted_status_to_videos_table	1
68	2026_06_02_210001_create_media_content_checks_table	1
69	2026_06_02_220001_create_rate_limits_table	1
70	2026_06_02_220002_create_security_logs_table	1
71	2026_06_02_300001_upgrade_video_comments_advanced	1
72	2026_06_02_300002_create_comment_reactions_table	1
73	2026_06_02_300003_create_comment_reports_table	1
74	2026_06_02_400001_add_device_type_to_video_views	1
75	2026_06_03_000001_create_promotions_table	1
76	2026_06_03_100001_expand_content_check_status_enum	1
77	2026_06_03_300001_add_gif_fields_to_video_comments	1
78	2026_06_03_400001_create_monetization_tables	1
79	2026_06_03_500001_add_root_id_to_video_comments	1
80	2026_06_03_600001_recalc_comment_counts	1
81	2026_06_03_900001_cleanup_orphaned_replies_and_sync_comments_count	1
82	2026_06_04_000001_create_stories_table	1
83	2026_06_04_000002_create_story_media_table	1
84	2026_06_04_100001_add_action_columns_to_direct_messages	1
85	2026_06_04_200001_add_message_privacy_to_users	1
86	2026_06_04_300001_add_save_watch_history_to_users_table	1
87	2026_06_04_300002_add_saved_privacy_to_users_table	1
88	2026_06_04_400001_create_creator_applications_table	1
89	2026_06_04_400002_add_creator_terms_to_users_table	1
90	2026_06_04_700001_fix_reply_count_total_thread	1
91	2026_06_04_800001_final_recalc_all_comment_counts	1
92	2026_06_04_900001_add_privacy_settings_to_users_table	1
93	2026_06_04_950001_add_security_fields_to_users_table	1
94	2026_06_04_960001_add_notification_preferences_to_users_table	1
95	2026_06_04_970001_add_content_preferences_to_users_table	1
96	2026_06_04_980001_add_accessibility_preferences_to_users_table	1
97	2026_06_06_000001_add_full_fields_to_verification_requests	1
98	2026_06_06_000003_add_step_fields_to_verification_requests	1
99	2026_06_07_000001_extend_wallets_table_for_coins	1
100	2026_06_07_000002_extend_wallet_transactions_for_coins	1
101	2026_06_07_000003_create_coin_packages_table	1
102	2026_06_07_000004_create_coin_orders_table	1
103	2026_06_07_000005_create_coin_gifts_table	1
104	2026_06_07_000006_create_admin_commissions_table	1
105	2026_06_07_000007_create_admin_coin_settings_table	1
106	2026_06_09_000001_add_paypal_credentials_to_admin_coin_settings	1
107	2026_06_09_000003_add_gateway_keys_to_admin_coin_settings	1
108	2026_06_09_100001_add_safety_prefs_to_user_moderation_settings	1
109	2026_06_10_000001_add_status_to_followers_table	1
110	2026_06_10_000001_create_signup_drafts_table	1
111	2026_06_10_000002_create_conversations_table	1
112	2026_06_10_000003_add_conversation_id_to_direct_messages_table	1
113	2026_06_10_000004_add_action_status_to_notifications_table	1
114	2026_06_10_100001_change_message_privacy_default_to_everyone	1
115	2026_06_10_100001_create_user_admin_restrictions_table	1
116	2026_06_10_200001_add_social_restrictions	1
117	2026_06_10_200001_change_notifications_type_to_varchar	1
118	2026_06_10_300001_add_suspension_dates	1
119	2026_06_10_300001_create_user_preferences_tables	1
120	2026_06_13_000001_create_comment_mentions_table	1
121	2026_06_13_100001_add_suggestion_fields_to_users	1
122	2026_06_13_100002_create_profile_suggestion_dismissals_table	1
123	2026_06_13_100003_create_profile_suggestion_logs_table	1
124	2026_06_13_300001_create_story_views_table	1
125	2026_06_13_400001_create_story_layers_table	1
126	2026_06_13_500001_create_story_reactions_table	1
127	2026_06_13_500002_create_story_messages_table	1
128	2026_06_13_500003_create_story_reports_table	1
129	2026_06_14_000001_add_story_reply_to_direct_messages	1
130	2026_06_15_000001_add_audio_mix_fields_to_videos_table	1
131	2026_06_15_000001_add_music_fields_to_audio_tracks_table	1
132	2026_06_15_000002_create_audio_favorites_table	1
133	2026_06_15_200001_create_music_tracks_table	1
134	2026_06_15_200002_create_music_usage_table	1
135	2026_06_15_200003_create_music_play_logs_table	1
136	2026_06_15_300001_add_music_track_id_to_videos_table	1
137	2026_06_15_400001_add_source_type_to_music_tracks_table	1
138	2026_06_15_500001_add_audio_type_to_videos_table	1
139	2026_06_16_000001_backfill_source_type_on_music_tracks	1
140	2026_06_16_100001_add_source_type_to_story_media	1
141	2026_06_17_000001_add_admin_controls_to_videos_table	1
142	2026_06_17_000002_create_video_monetization_table	1
143	2026_06_17_000003_add_deletion_tracking_to_videos	1
144	2026_06_17_000004_add_last_login_at_to_users	1
145	2026_06_17_200001_create_video_watch_sessions_table	1
146	2026_06_17_200002_create_video_watch_events_table	1
147	2026_06_17_200003_add_watch_metrics_to_videos_table	1
148	2026_06_19_000001_add_feed_performance_indexes_to_videos_table	1
149	2026_06_19_100001_add_admin_meta_to_messages_and_conversations	1
150	2026_06_19_200001_add_restrictions_config_to_conversations	1
151	2026_06_21_000001_add_text_post_fields_to_videos_table	1
152	2026_06_22_000001_remove_text_post_feature	1
153	2026_06_23_120001_add_two_factor_to_users_table	1
154	2026_06_25_000001_add_studio_moderation_to_video_comments	1
155	2026_06_27_000001_add_profile_view_history_to_users_table	1
156	2026_06_27_000001_add_user_id_to_signup_drafts	1
157	2026_06_27_000002_add_activity_status_to_users_table	1
158	2026_06_28_000001_convert_json_columns_to_jsonb	1
\.


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migrations_id_seq', 158, true);


--
-- PostgreSQL database dump complete
--

\unrestrict F5MDw1lY77MjLKiIxb1tc5fCn6TdCuyOGLAn3SophEyHSG0fwOyNSJOF8SXPNFh

