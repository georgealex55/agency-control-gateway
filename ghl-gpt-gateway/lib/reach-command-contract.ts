/** Presentation-only layout schema. No credentials, business records, or client data. */
export const COMMAND_WIDGET_IDS=["readiness","social","connections","delivery","actions","shortcuts","roadmap"] as const;
export type CommandWidgetId=(typeof COMMAND_WIDGET_IDS)[number];
export type CommandLayout={order:CommandWidgetId[];hidden:CommandWidgetId[];wide:CommandWidgetId[]};
export const DEFAULT_COMMAND_LAYOUT:CommandLayout={
 order:["readiness","social","connections","delivery","actions","shortcuts","roadmap"],
 hidden:[],wide:["actions","shortcuts"]
};
const allowed=new Set<string>(COMMAND_WIDGET_IDS);
const uniqueWidgetList=(value:unknown):value is CommandWidgetId[]=>
 Array.isArray(value)&&value.every(v=>typeof v==="string"&&allowed.has(v))&&new Set(value).size===value.length;
export function parseCommandLayout(value:unknown):CommandLayout|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const x=value as Record<string,unknown>;
 if(Object.keys(x).some(k=>!["order","hidden","wide"].includes(k)))return null;
 // Capture narrowed references: callbacks do not retain narrowing on mutable object fields.
 const order=x.order,hidden=x.hidden,wide=x.wide;
 if(!uniqueWidgetList(order)||order.length!==COMMAND_WIDGET_IDS.length)return null;
 if(!COMMAND_WIDGET_IDS.every(id=>order.includes(id)))return null;
 if(!uniqueWidgetList(hidden)||!uniqueWidgetList(wide))return null;
 return {order:[...order],hidden:[...hidden],wide:[...wide]};
}
export function normalizeCommandLayout(value:unknown):CommandLayout{
 return parseCommandLayout(value)||{
  order:[...DEFAULT_COMMAND_LAYOUT.order],hidden:[...DEFAULT_COMMAND_LAYOUT.hidden],wide:[...DEFAULT_COMMAND_LAYOUT.wide]
 };
}
