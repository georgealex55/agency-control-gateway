import { NextResponse } from "next/server";

const actions = [
  "list_locations",
  "list_social_accounts", "list_social_posts", "get_social_post", "create_social_post", "update_social_post", "delete_social_post",
  "list_blogs", "list_blog_posts", "get_blog_post", "create_blog_post", "update_blog_post",
  "list_workflows", "add_contact_to_workflow", "remove_contact_from_workflow",
  "list_funnels", "list_funnel_pages", "list_redirects", "create_redirect",
  "list_courses", "list_membership_products", "get_course", "list_course_categories", "list_course_modules", "list_course_lessons", "list_course_posts"
];

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "HighLevel Agency Control Gateway",
      version: "2.4.0",
      description: "Secure GPT-facing control layer for HighLevel. Native writes include CRM, Social Planner and blogs; workflow definitions and funnel/page design are read/discovery only where HighLevel's public API is read-only. Courses/memberships are exposed as read-only discovery actions for products, categories/modules, and lessons/posts."
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: { GatewayKey: { type: "apiKey", in: "header", name: "x-gateway-key" } }
    },
    security: [{ GatewayKey: [] }],
    paths: {
      "/api/sites/websites": {
        get: {
          operationId: "listWebsites",
          summary: "List websites for a HighLevel location/sub-account",
          parameters: [
            { name: "locationId", in: "query", required: true, schema: { type: "string" } },
            { name: "name", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
            { name: "includeAll", in: "query", required: false, schema: { type: "boolean", default: false } }
          ],
          responses: {
            "200": { description: "Website listing" },
            "400": { description: "Missing/invalid location" },
            "401": { description: "Invalid gateway key" }
          }
        }
      },
      "/api/agency/action": {
        post: {
          operationId: "agencyAction",
          summary: "Perform a named HighLevel agency/sub-account action",
          requestBody: {
            required: true,
            content: { "application/json": { schema: {
              type: "object",
              required: ["action"],
              properties: {
                action: { type: "string", enum: actions },
                locationId: { type: "string" },
                id: { type: "string", description: "Post/blog/resource id when required." },
                blogId: { type: "string" },
                funnelId: { type: "string" },
                productId: { type: "string", description: "Course product id when reading course categories/modules or lessons/posts." },
                categoryId: { type: "string", description: "Course category/module id when filtering lessons/posts." },
                contactId: { type: "string" },
                workflowId: { type: "string" },
                status: { type: "string" },
                searchTerm: { type: "string" },
                search: { type: "string", description: "Case-insensitive title search for courses." },
                cursor: { type: "string", description: "Opaque cursor from a previous course page." },
                name: { type: "string" },
                type: { type: "string" },
                category: { type: "string" },
                parentId: { type: "string" },
                limit: { type: "integer" },
                offset: { type: "integer" },
                skip: { type: "integer" },
                confirmDestructive: { type: "boolean", description: "Must be true for delete/remove actions, and ALLOW_DESTRUCTIVE_ACTIONS must also be true on Vercel." },
                body: { type: ["object", "array", "null"], additionalProperties: true, description: "HighLevel request body for create/update actions." }
              },
              additionalProperties: false
            } } }
          },
          responses: { "200": { description: "Action response" }, "400": { description: "Invalid/blocked action" }, "401": { description: "Invalid gateway key" } }
        }
      },
      "/api/ghl/request": {
        post: {
          operationId: "highLevelAdvancedRequest",
          summary: "Advanced allowlisted HighLevel API call",
          requestBody: { required: true, content: { "application/json": { schema: {
            type: "object", required: ["method", "path"], properties: {
              method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
              path: { type: "string" },
              body: { type: ["object", "array", "null"], additionalProperties: true },
              confirmDestructive: { type: "boolean" }
            }
          } } } },
          responses: { "200": { description: "HighLevel response" }, "400": { description: "Invalid/non-allowlisted request" }, "401": { description: "Invalid gateway key" } }
        }
      }
    }
  });
}
