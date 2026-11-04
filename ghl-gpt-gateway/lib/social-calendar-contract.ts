/** Month-calendar boundaries are supplied as UTC timestamps derived from the operator's local month.
 * The database never accepts an arbitrary long-range query or unbounded pagination.
 */
export const CALENDAR_MAX_ITEMS=500;
export type CalendarRange={start:string;end:string};
export function validCalendarRange(start:unknown,end:unknown):start is string{
 if(typeof start!=="string"||typeof end!=="string")return false;
 const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
 if(!iso.test(start)||!iso.test(end))return false;
 const a=Date.parse(start),b=Date.parse(end);
 if(!Number.isFinite(a)||!Number.isFinite(b)||new Date(a).toISOString()!==new Date(start).toISOString()||new Date(b).toISOString()!==new Date(end).toISOString())return false;
 const duration=b-a;
 return duration>=24*60*60*1000&&duration<=45*24*60*60*1000;
}
export function localMonthBounds(month:string):CalendarRange|null{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
 const [year,mm]=month.split("-").map(Number);
 if(year<2020||year>2100)return null;
 return {start:new Date(year,mm-1,1).toISOString(),end:new Date(year,mm,1).toISOString()};
}
export function shiftMonth(month:string,delta:number):string{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!Number.isInteger(delta)||Math.abs(delta)>1)throw Error("Invalid month");
 const [y,m]=month.split("-").map(Number),d=new Date(Date.UTC(y,m-1+delta,1));
 return d.toISOString().slice(0,7);
}
export function localDayKey(date:string):string{
 const d=new Date(date);if(!Number.isFinite(d.getTime()))throw Error("Invalid date");
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
 return y+"-"+m+"-"+day;
}
