/** Real HTTP client for the ticket endpoints (Node/Postgres server now, Spring Boot later). */
import { qs, request, requestForm } from './http';
import type { CreatedTicket, FilterOptions, ListKind, NewTicketInput, Option, TicketAction, TicketApi, TicketDetail, TicketFilters, TicketMasters, TicketPage, TicketStatus } from './ticketTypes';

export const ticketHttp: TicketApi = {
  getMasters: () => request<TicketMasters>('/tickets/masters'),
  createTicket: (input: NewTicketInput, files: File[]) => {
    const form = new FormData();
    form.append('data', JSON.stringify(input));
    files.forEach((f) => form.append('attachments', f, f.name));
    return requestForm<CreatedTicket>('/tickets', form);
  },
  listTickets: (list: ListKind, f: TicketFilters, page: number) => request<TicketPage>(`/tickets?${qs({ list, page, ...f })}`),
  getFilterOptions: (list: ListKind) => request<FilterOptions>(`/tickets/filter-options?${qs({ list })}`),
  getTicket: (number: string) => request<TicketDetail>(`/tickets/${encodeURIComponent(number)}`),
  act: (number: string, expectedStatus: TicketStatus, action: TicketAction) =>
    request<TicketDetail | null>(`/tickets/${encodeURIComponent(number)}/actions`, { expectedStatus, action }),
  getReassignTargets: () => request<Option[]>('/tickets/reassign-targets'),
};
