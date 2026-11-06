-- Help desk ticket tables. The existing tables (resolver_login_eobc, resolver_login_hd, dealer_login,
-- issue_routing_master) are NOT modified. Safe to run more than once.

-- One sequence per wing: E000001.. for EoBC, H000001.. for HelpDesk. Sequences never hand out the same number twice,
-- even for simultaneous submissions (numbers may skip if a submission is rolled back).
create sequence if not exists hd_ref_seq_e;
create sequence if not exists hd_ref_seq_h;

create table if not exists hd_ticket (
  id                    bigserial primary key,
  ref_no                varchar(12)  not null unique,
  client_request_id     varchar(64)  not null,
  wing                  varchar(50)  not null,
  authenticator         varchar(50)  not null,
  raised_by_ref         varchar(60)  not null,
  raised_by_name        varchar(200) not null,
  -- Help desk ticket creators only
  ticket_type           varchar(100),
  source_of_issue       varchar(100),
  received_date         date,
  complainant_name      varchar(200) not null,
  complainant_email     varchar(200) not null,
  complainant_mobile    varchar(15),
  nature_of_issue       varchar(100) not null,
  issue_category        varchar(100) not null,
  sub_category          varchar(150) not null default '',
  field_set             varchar(20)  not null,
  arr_number            varchar(100),
  model2_user_id        varchar(100),
  task_transfer_details text,
  brand                 varchar(100),
  model                 varchar(100),
  serial_number         varchar(100),
  building              varchar(150),
  room                  varchar(50),
  physical_location     varchar(300),
  description           text not null,
  -- routing rule used for the first assignment (kept for audit)
  route_id              bigint,
  route_assign_to       varchar(100) not null,
  status                varchar(12)  not null default 'new' check (status in ('new','inprogress','onhold','resolved','deleted')),
  assignee_ref          varchar(60)  not null,
  assignee_name         varchar(200) not null,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now(),
  unique (raised_by_ref, client_request_id)
);
create index if not exists hd_ticket_raised_by_idx on hd_ticket (raised_by_ref, created_at desc);
create index if not exists hd_ticket_assignee_idx  on hd_ticket (assignee_ref, status, created_at desc);

-- Action history and assignment / transfer history (one table, split by kind).
create table if not exists hd_ticket_event (
  id          bigserial primary key,
  ticket_id   bigint not null references hd_ticket(id),
  at          timestamptz not null default now(),
  kind        varchar(20) not null,   -- created, started, remark, hold, resume, resolve, reopen, delete, assigned, reassigned, transferred
  actor_ref   varchar(60) not null,
  actor_name  varchar(200) not null,
  actor_role  varchar(20) not null,
  remark      text not null default '',
  from_ref    varchar(60),
  from_name   varchar(200),
  to_ref      varchar(60),
  to_name     varchar(200)
);
create index if not exists hd_ticket_event_ticket_idx on hd_ticket_event (ticket_id, at, id);

-- Attachment details. The files themselves are stored in the configured uploads folder.
create table if not exists hd_ticket_attachment (
  id            bigserial primary key,
  ticket_id     bigint not null references hd_ticket(id),
  slot          smallint not null,
  kind          varchar(10) not null check (kind in ('proof','other')),
  original_name varchar(255) not null,
  stored_path   varchar(500) not null,
  content_type  varchar(50) not null,
  size_bytes    integer not null,
  sha256        char(64) not null
);
create index if not exists hd_ticket_attachment_ticket_idx on hd_ticket_attachment (ticket_id);
