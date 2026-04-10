import { EventEmitter } from "events";

export type DataChannel = "projects" | "tags" | "team";

export interface DataChangeEvent {
  type: "data:changed";
  channel: DataChannel;
}

export interface DiscussionChangeEvent {
  type: "discussion:new";
  channel: "discussions";
  entryId: string;
}

class DataBroadcaster extends EventEmitter {}
class DiscussionBroadcaster extends EventEmitter {}

export const dataBroadcaster = new DataBroadcaster();
dataBroadcaster.setMaxListeners(1000);

export const discussionBroadcaster = new DiscussionBroadcaster();
discussionBroadcaster.setMaxListeners(1000);

export function broadcastDataChange(channel: DataChannel) {
  dataBroadcaster.emit("data", { type: "data:changed", channel } satisfies DataChangeEvent);
}

export function broadcastDiscussionChange(entryId: string) {
  discussionBroadcaster.emit("discussion", { type: "discussion:new", channel: "discussions", entryId } satisfies DiscussionChangeEvent);
}
