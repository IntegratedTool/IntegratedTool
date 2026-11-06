-- Second set of ticket changes: Withdraw / Close statuses, resolved date, duplicate-case audit, Super Admin settings.
-- Existing tables are NOT modified. Safe to run more than once.

alter table hd_ticket add column if not exists resolved_at timestamptz;
alter table hd_ticket add column if not exists duplicate_of varchar(12);
alter table hd_ticket add column if not exists dup_score smallint;

-- "Deleted" is replaced by "Withdrawn" (raiser, while New) and "Closed" (admin, or automatically after Resolved).
alter table hd_ticket drop constraint if exists hd_ticket_status_check;
update hd_ticket set status = 'withdrawn' where status = 'deleted';
update hd_ticket_event set kind = 'withdraw' where kind = 'delete';
alter table hd_ticket add constraint hd_ticket_status_check check (status in ('new','inprogress','onhold','resolved','closed','withdrawn'));

update hd_ticket t set resolved_at = (select max(e.at) from hd_ticket_event e where e.ticket_id = t.id and e.kind = 'resolve')
 where t.status = 'resolved' and t.resolved_at is null;

create index if not exists hd_ticket_status_resolved_idx on hd_ticket (status, resolved_at);
create index if not exists hd_ticket_created_idx on hd_ticket (created_at);

-- Super Admin console values (only values that differ from the built-in defaults are stored) and their change log.
create table if not exists hd_setting (
  key         varchar(80) primary key,
  value       text not null,
  updated_by  varchar(200),
  updated_at  timestamptz not null default now()
);
create table if not exists hd_setting_log (
  id          bigserial primary key,
  key         varchar(80) not null,
  old_value   text,
  new_value   text not null,
  changed_by  varchar(200) not null,
  changed_at  timestamptz not null default now()
);
