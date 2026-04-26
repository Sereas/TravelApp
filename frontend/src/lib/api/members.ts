import { request } from "./transport";
import type {
  TripMember,
  InviteLink,
  InvitePreview,
  InviteAcceptResult,
} from "./types";

// --- Trip-scoped (authenticated) ---

export const listMembers = (tripId: string) =>
  request<TripMember[]>(`/api/v1/trips/${tripId}/members`);

export const createInvitation = (tripId: string) =>
  request<InviteLink>(`/api/v1/trips/${tripId}/invitations`, {
    method: "POST",
  });

export const listInvitations = (tripId: string) =>
  request<InviteLink[]>(`/api/v1/trips/${tripId}/invitations`);

export const revokeInvitation = (tripId: string, invitationId: string) =>
  request<void>(`/api/v1/trips/${tripId}/invitations/${invitationId}`, {
    method: "DELETE",
  });

export const removeMember = (tripId: string, memberId: string) =>
  request<void>(`/api/v1/trips/${tripId}/members/${memberId}`, {
    method: "DELETE",
  });

// --- Public invite endpoints ---

export const getInvitePreview = (token: string) =>
  request<InvitePreview>(`/api/v1/invitations/${token}`, {}, { auth: false });

export const acceptInvitation = (token: string) =>
  request<InviteAcceptResult>(`/api/v1/invitations/${token}/accept`, {
    method: "POST",
  });
