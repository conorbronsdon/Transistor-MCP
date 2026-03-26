export interface GetAuthenticatedUserArgs {
  // No arguments needed for this endpoint
}

export interface AuthorizeUploadArgs {
  filename: string;
}

export interface ListShowsArgs {
  page?: number;
  per?: number;
  private?: boolean;
  query?: string;
}

export interface ListEpisodesArgs {
  show_id: string;
  page?: number;
  per?: number;
  query?: string;
  status?: "published" | "draft" | "scheduled";
  order?: "asc" | "desc";
  fields?: { [key: string]: string[] };
}

export interface CreateEpisodeArgs {
  show_id: string;
  title: string;
  audio_url: string;
  summary?: string;
  description?: string;
  transcript_text?: string;
  author?: string;
  explicit?: boolean;
  image_url?: string;
  keywords?: string;
  number?: number;
  season_number?: number;
  type?: "full" | "trailer" | "bonus";
  alternate_url?: string;
  video_url?: string;
  email_notifications?: boolean;
  increment_number?: boolean;
  status?: "published" | "draft" | "scheduled";
}

export interface UpdateEpisodeArgs {
  episode_id: string;
  title?: string;
  summary?: string;
  description?: string;
  transcript_text?: string;
  author?: string;
  explicit?: boolean;
  image_url?: string;
  keywords?: string;
  number?: number;
  season_number?: number;
  episode_number?: number;
  type?: "full" | "trailer" | "bonus";
  alternate_url?: string;
  video_url?: string;
  email_notifications?: boolean;
  status?: "published" | "draft" | "scheduled";
}

export interface GetAnalyticsArgs {
  show_id: string;
  episode_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface GetAllEpisodeAnalyticsArgs {
  show_id: string;
  start_date?: string;
  end_date?: string;
}

export interface ListWebhooksArgs {
  show_id: string;
}

export interface SubscribeWebhookArgs {
  event_name: string;
  show_id: string;
  url: string;
}

export interface UnsubscribeWebhookArgs {
  webhook_id: string;
}

export interface GetEpisodeArgs {
  episode_id: string;
  include?: string[];
  fields?: { [key: string]: string[] };
}

export interface GetDownloadSummaryArgs {
  show_id: string;
  episode_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface CompareEpisodesArgs {
  episode_ids: string[];
  start_date?: string;
  end_date?: string;
}

// --- Validators ---

export function isListShowsArgs(args: unknown): args is ListShowsArgs {
  if (!args || typeof args !== "object") return false;
  const { page, per, query } = args as ListShowsArgs;
  return (
    (page === undefined || typeof page === "number") &&
    (per === undefined || typeof per === "number") &&
    (query === undefined || typeof query === "string")
  );
}

export function isListEpisodesArgs(args: unknown): args is ListEpisodesArgs {
  if (!args || typeof args !== "object") return false;
  const { show_id, page, per, query, status, order, fields } =
    args as ListEpisodesArgs;
  return (
    typeof show_id === "string" &&
    (page === undefined || typeof page === "number") &&
    (per === undefined || typeof per === "number") &&
    (query === undefined || typeof query === "string") &&
    (status === undefined ||
      ["published", "draft", "scheduled"].includes(status)) &&
    (order === undefined || ["asc", "desc"].includes(order)) &&
    (fields === undefined || typeof fields === "object")
  );
}

export function isCreateEpisodeArgs(args: unknown): args is CreateEpisodeArgs {
  if (!args || typeof args !== "object") return false;
  const { show_id, title, audio_url } = args as CreateEpisodeArgs;
  return (
    typeof show_id === "string" &&
    typeof title === "string" &&
    typeof audio_url === "string"
  );
}

export function isUpdateEpisodeArgs(args: unknown): args is UpdateEpisodeArgs {
  if (!args || typeof args !== "object") return false;
  const { episode_id } = args as UpdateEpisodeArgs;
  return typeof episode_id === "string";
}

export function isGetAnalyticsArgs(args: unknown): args is GetAnalyticsArgs {
  if (!args || typeof args !== "object") return false;
  const { show_id, episode_id, start_date, end_date } =
    args as GetAnalyticsArgs;
  return (
    typeof show_id === "string" &&
    (episode_id === undefined || typeof episode_id === "string") &&
    (start_date === undefined || typeof start_date === "string") &&
    (end_date === undefined || typeof end_date === "string")
  );
}

export function isGetAllEpisodeAnalyticsArgs(
  args: unknown
): args is GetAllEpisodeAnalyticsArgs {
  if (!args || typeof args !== "object") return false;
  const { show_id, start_date, end_date } =
    args as GetAllEpisodeAnalyticsArgs;
  return (
    typeof show_id === "string" &&
    (start_date === undefined || typeof start_date === "string") &&
    (end_date === undefined || typeof end_date === "string")
  );
}

export function isListWebhooksArgs(args: unknown): args is ListWebhooksArgs {
  if (!args || typeof args !== "object") return false;
  const { show_id } = args as ListWebhooksArgs;
  return typeof show_id === "string";
}

export function isSubscribeWebhookArgs(
  args: unknown
): args is SubscribeWebhookArgs {
  if (!args || typeof args !== "object") return false;
  const { event_name, show_id, url } = args as SubscribeWebhookArgs;
  return (
    typeof event_name === "string" &&
    typeof show_id === "string" &&
    typeof url === "string"
  );
}

export function isUnsubscribeWebhookArgs(
  args: unknown
): args is UnsubscribeWebhookArgs {
  if (!args || typeof args !== "object") return false;
  const { webhook_id } = args as UnsubscribeWebhookArgs;
  return typeof webhook_id === "string";
}

export function isGetAuthenticatedUserArgs(
  args: unknown
): args is GetAuthenticatedUserArgs {
  return true;
}

export function isAuthorizeUploadArgs(
  args: unknown
): args is AuthorizeUploadArgs {
  if (!args || typeof args !== "object") return false;
  const { filename } = args as AuthorizeUploadArgs;
  return typeof filename === "string";
}

export function isGetEpisodeArgs(args: unknown): args is GetEpisodeArgs {
  if (!args || typeof args !== "object") return false;
  const { episode_id, include, fields } = args as GetEpisodeArgs;
  return (
    typeof episode_id === "string" &&
    (include === undefined || Array.isArray(include)) &&
    (fields === undefined || typeof fields === "object")
  );
}

export function isGetDownloadSummaryArgs(
  args: unknown
): args is GetDownloadSummaryArgs {
  if (!args || typeof args !== "object") return false;
  const { show_id, episode_id, start_date, end_date } =
    args as GetDownloadSummaryArgs;
  return (
    typeof show_id === "string" &&
    (episode_id === undefined || typeof episode_id === "string") &&
    (start_date === undefined || typeof start_date === "string") &&
    (end_date === undefined || typeof end_date === "string")
  );
}

export function isCompareEpisodesArgs(
  args: unknown
): args is CompareEpisodesArgs {
  if (!args || typeof args !== "object") return false;
  const { episode_ids, start_date, end_date } = args as CompareEpisodesArgs;
  return (
    Array.isArray(episode_ids) &&
    episode_ids.length >= 2 &&
    episode_ids.every((id: unknown) => typeof id === "string") &&
    (start_date === undefined || typeof start_date === "string") &&
    (end_date === undefined || typeof end_date === "string")
  );
}
