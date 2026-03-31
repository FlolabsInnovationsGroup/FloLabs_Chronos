import { EventEmitter } from "events";

export type DataChannel = "projects" | "tags" | "team";

export interface DataChangeEvent {
  type: "data:changed";
  channel: DataChannel;
}

class DataBroadcaster extends EventEmitter {}

export const dataBroadcaster = new DataBroadcaster();
dataBroadcaster.setMaxListeners(1000);

export function broadcastDataChange(channel: DataChannel) {
  dataBroadcaster.emit("data", { type: "data:changed", channel } satisfies DataChangeEvent);
}
