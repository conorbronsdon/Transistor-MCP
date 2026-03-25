import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { TransistorApiClient } from "./api-client.js";
import {
  isListShowsArgs,
  isListEpisodesArgs,
  isCreateEpisodeArgs,
  isUpdateEpisodeArgs,
  isGetAnalyticsArgs,
  isGetEpisodeArgs,
  isGetAllEpisodeAnalyticsArgs,
  isListWebhooksArgs,
  isSubscribeWebhookArgs,
  isUnsubscribeWebhookArgs,
  isGetAuthenticatedUserArgs,
  isAuthorizeUploadArgs,
  AuthorizeUploadArgs,
} from "./types.js";
import axios from "axios";

/**
 * Strip heavy fields from episode responses to reduce token usage.
 * Removes HTML descriptions, embed codes, and formatted variants
 * that are rarely needed by the caller.
 */
function trimEpisodeResponse(data: any): any {
  if (!data?.data) return data;

  const strip = (attrs: any) => {
    if (!attrs) return;
    delete attrs.formatted_description;
    delete attrs.formatted_summary;
    delete attrs.embed_html;
    delete attrs.embed_html_dark;
    // Keep description and summary since callers may need them
  };

  if (Array.isArray(data.data)) {
    for (const ep of data.data) strip(ep?.attributes);
  } else {
    strip(data.data?.attributes);
  }
  return data;
}

export class ToolHandlers {
  constructor(private apiClient: TransistorApiClient) {}

  getToolDefinitions() {
    return [
      {
        name: "get_authenticated_user",
        description: "Get details of the authenticated user account",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "authorize_upload",
        description: "Get a pre-signed URL for uploading an audio file",
        inputSchema: {
          type: "object",
          properties: {
            filename: {
              type: "string",
              description: "Filename of the audio file to upload",
            },
          },
          required: ["filename"],
        },
      },
      {
        name: "list_shows",
        description: "List all shows in your Transistor.fm account",
        inputSchema: {
          type: "object",
          properties: {
            page: {
              type: "number",
              description: "Page number for pagination",
              minimum: 1,
            },
            per: {
              type: "number",
              description: "Items per page (default 10, max 100)",
              minimum: 1,
              maximum: 100,
            },
            private: {
              type: "boolean",
              description: "Filter for private shows",
            },
            query: {
              type: "string",
              description: "Search query to filter shows",
            },
          },
        },
      },
      {
        name: "list_episodes",
        description:
          "List episodes for a specific show. Use 'fields' to request only specific attributes and reduce response size (e.g. {\"episode\": [\"title\", \"number\", \"status\", \"season\"]}). Use 'query' to search by title.",
        inputSchema: {
          type: "object",
          properties: {
            show_id: {
              type: "string",
              description: "ID of the show to list episodes for",
            },
            page: {
              type: "number",
              description: "Page number for pagination",
              minimum: 1,
            },
            per: {
              type: "number",
              description: "Items per page (default 10, max 100)",
              minimum: 1,
              maximum: 100,
            },
            query: {
              type: "string",
              description: "Search episodes by title",
            },
            status: {
              type: "string",
              enum: ["published", "draft", "scheduled"],
              description: "Filter episodes by status",
            },
            order: {
              type: "string",
              enum: ["asc", "desc"],
              description:
                "Sort order: 'desc' (newest first, default) or 'asc' (oldest first)",
            },
            fields: {
              type: "object",
              description:
                "Sparse fieldsets to reduce response size. Keys are resource types (e.g. 'episode'), values are arrays of field names (e.g. ['title', 'number', 'status', 'season', 'transcript_url'])",
            },
          },
          required: ["show_id"],
        },
      },
      {
        name: "create_episode",
        description: "Create a new episode",
        inputSchema: {
          type: "object",
          properties: {
            show_id: {
              type: "string",
              description: "ID of the show to create the episode in",
            },
            title: {
              type: "string",
              description: "Episode title",
            },
            audio_url: {
              type: "string",
              description: "URL to the episode audio file",
            },
            summary: {
              type: "string",
              description: "Episode summary",
            },
            description: {
              type: "string",
              description: "Episode description (supports HTML)",
            },
            transcript_text: {
              type: "string",
              description: "Plain text transcript for the episode",
            },
            author: {
              type: "string",
              description: "Episode author name",
            },
            explicit: {
              type: "boolean",
              description: "Whether the episode contains explicit content",
            },
            image_url: {
              type: "string",
              description: "URL to episode artwork",
            },
            keywords: {
              type: "string",
              description: "Comma-separated list of keywords",
            },
            number: {
              type: "number",
              description: "Episode number",
            },
            season_number: {
              type: "number",
              description: "Season number",
            },
            type: {
              type: "string",
              enum: ["full", "trailer", "bonus"],
              description: "Episode type",
            },
            alternate_url: {
              type: "string",
              description: "Override the default share URL",
            },
            video_url: {
              type: "string",
              description: "YouTube or video URL",
            },
            email_notifications: {
              type: "boolean",
              description: "Override show email notification setting",
            },
            increment_number: {
              type: "boolean",
              description: "Auto-set next episode number",
            },
            status: {
              type: "string",
              enum: ["published", "draft", "scheduled"],
              description: "Episode status",
            },
          },
          required: ["show_id", "title", "audio_url"],
        },
      },
      {
        name: "update_episode",
        description: "Update an existing episode",
        inputSchema: {
          type: "object",
          properties: {
            episode_id: {
              type: "string",
              description: "ID of the episode to update",
            },
            title: {
              type: "string",
              description: "New episode title",
            },
            summary: {
              type: "string",
              description: "New episode summary",
            },
            description: {
              type: "string",
              description: "New episode description (supports HTML)",
            },
            transcript_text: {
              type: "string",
              description: "Plain text transcript for the episode",
            },
            author: {
              type: "string",
              description: "Episode author name",
            },
            explicit: {
              type: "boolean",
              description: "Whether the episode contains explicit content",
            },
            image_url: {
              type: "string",
              description: "URL to episode artwork",
            },
            keywords: {
              type: "string",
              description: "Comma-separated list of keywords",
            },
            number: {
              type: "number",
              description: "Episode number",
            },
            season_number: {
              type: "number",
              description: "New season number",
            },
            episode_number: {
              type: "number",
              description: "New episode number (alias for number)",
            },
            type: {
              type: "string",
              enum: ["full", "trailer", "bonus"],
              description: "Episode type",
            },
            alternate_url: {
              type: "string",
              description: "Override the default share URL",
            },
            video_url: {
              type: "string",
              description: "YouTube or video URL",
            },
            email_notifications: {
              type: "boolean",
              description: "Override show email notification setting",
            },
            status: {
              type: "string",
              enum: ["published", "draft", "scheduled"],
              description: "New episode status",
            },
          },
          required: ["episode_id"],
        },
      },
      {
        name: "get_analytics",
        description:
          "Get analytics for a show or episode. Defaults to last 14 days if no dates provided.",
        inputSchema: {
          type: "object",
          properties: {
            show_id: {
              type: "string",
              description: "ID of the show to get analytics for",
            },
            episode_id: {
              type: "string",
              description:
                "ID of the episode to get analytics for (optional)",
            },
            start_date: {
              type: "string",
              description: "Start date in dd-mm-yyyy format (optional)",
            },
            end_date: {
              type: "string",
              description: "End date in dd-mm-yyyy format (optional)",
            },
          },
          required: ["show_id"],
        },
      },
      {
        name: "get_episode",
        description: "Get a single episode",
        inputSchema: {
          type: "object",
          properties: {
            episode_id: {
              type: "string",
              description: "ID of the episode to get",
            },
            include: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Include related resources",
            },
            fields: {
              type: "object",
              description: "Sparse fieldsets",
            },
          },
          required: ["episode_id"],
        },
      },
      {
        name: "get_all_episode_analytics",
        description:
          "Get analytics for all episodes of a show. Defaults to last 7 days if no dates provided.",
        inputSchema: {
          type: "object",
          properties: {
            show_id: {
              type: "string",
              description: "ID of the show to get analytics for",
            },
            start_date: {
              type: "string",
              description: "Start date in dd-mm-yyyy format (optional)",
            },
            end_date: {
              type: "string",
              description: "End date in dd-mm-yyyy format (optional)",
            },
          },
          required: ["show_id"],
        },
      },
      {
        name: "list_webhooks",
        description: "List all webhooks for a show",
        inputSchema: {
          type: "object",
          properties: {
            show_id: {
              type: "string",
              description: "ID of the show to list webhooks for",
            },
          },
          required: ["show_id"],
        },
      },
      {
        name: "subscribe_webhook",
        description: "Subscribe to a webhook for a show",
        inputSchema: {
          type: "object",
          properties: {
            event_name: {
              type: "string",
              description: "Event name (e.g., 'episode_created')",
            },
            show_id: {
              type: "string",
              description: "ID of the show to subscribe to",
            },
            url: {
              type: "string",
              description: "URL to receive webhook events",
            },
          },
          required: ["event_name", "show_id", "url"],
        },
      },
      {
        name: "unsubscribe_webhook",
        description: "Unsubscribe from a webhook",
        inputSchema: {
          type: "object",
          properties: {
            webhook_id: {
              type: "string",
              description: "ID of the webhook to unsubscribe from",
            },
          },
          required: ["webhook_id"],
        },
      },
    ];
  }

  async handleToolCall(name: string, args: unknown) {
    try {
      switch (name) {
        case "get_authenticated_user": {
          if (!isGetAuthenticatedUserArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for get_authenticated_user"
            );
          }
          const data = await this.apiClient.getAuthenticatedUser();
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "authorize_upload": {
          if (!isAuthorizeUploadArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for authorize_upload"
            );
          }
          const data = await this.apiClient.authorizeUpload(args);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "list_shows": {
          if (!isListShowsArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for list_shows"
            );
          }
          const data = await this.apiClient.listShows(args);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "list_episodes": {
          if (!isListEpisodesArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for list_episodes"
            );
          }
          const data = await this.apiClient.listEpisodes(args);
          const trimmed = trimEpisodeResponse(data);
          return {
            content: [
              { type: "text", text: JSON.stringify(trimmed, null, 2) },
            ],
          };
        }

        case "create_episode": {
          if (!isCreateEpisodeArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for create_episode"
            );
          }
          const data = await this.apiClient.createEpisode(args);
          const trimmed = trimEpisodeResponse(data);
          return {
            content: [
              { type: "text", text: JSON.stringify(trimmed, null, 2) },
            ],
          };
        }

        case "update_episode": {
          if (!isUpdateEpisodeArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for update_episode"
            );
          }
          const data = await this.apiClient.updateEpisode(args);
          const trimmed = trimEpisodeResponse(data);
          return {
            content: [
              { type: "text", text: JSON.stringify(trimmed, null, 2) },
            ],
          };
        }

        case "get_analytics": {
          if (!isGetAnalyticsArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for get_analytics"
            );
          }
          const data = await this.apiClient.getAnalytics(args);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "get_episode": {
          if (!isGetEpisodeArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for get_episode"
            );
          }
          const data = await this.apiClient.getEpisode(args);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "get_all_episode_analytics": {
          if (!isGetAllEpisodeAnalyticsArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for get_all_episode_analytics"
            );
          }
          const data = await this.apiClient.getAllEpisodeAnalytics(args);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "list_webhooks": {
          if (!isListWebhooksArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for list_webhooks"
            );
          }
          const data = await this.apiClient.listWebhooks(args);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "subscribe_webhook": {
          if (!isSubscribeWebhookArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for subscribe_webhook"
            );
          }
          const data = await this.apiClient.subscribeWebhook(args);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        case "unsubscribe_webhook": {
          if (!isUnsubscribeWebhookArgs(args)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "Invalid arguments for unsubscribe_webhook"
            );
          }
          const data = await this.apiClient.unsubscribeWebhook(args);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [
            {
              type: "text",
              text: `Transistor API error: ${
                error.response?.data?.message ?? error.message
              }`,
            },
          ],
          isError: true,
        };
      }
      throw error;
    }
  }
}
