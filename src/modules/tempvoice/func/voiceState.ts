import { putState, delState as dbDeleteState, allStates, addWaiting, rmWaiting as dbRemoveWaitingRoom, allWaiting, putSettings, allSettings } from "./db.ts";

export interface TempChannelState {
  ownerId: string;
  trusted: Set<string>;
  blocked: Set<string>;
  locked: boolean;
  hidden: boolean;
  chatLocked: boolean;
  waiting: boolean;
  waitingChannelId: string | null;
  lastRename: number;
  threadId: string | null;
  password: string | null;
}

const states = new Map<string, TempChannelState>();
const waitingRooms = new Map<string, string>();

function serState(state: TempChannelState): string {
  return JSON.stringify({
  ...state,
    trusted: [...state.trusted],
    blocked: [...state.blocked],
  });
}

function deserState(raw: string): TempChannelState {
  const data = JSON.parse(raw);
  return {
  ...data,
    trusted: new Set(data.trusted),
    blocked: new Set(data.blocked),
  };
}

export function loadStates(): void {
  for (const { id, state } of allStates()) states.set(id, deserState(state));
  for (const { waiting_id, temp_id } of allWaiting()) waitingRooms.set(waiting_id, temp_id);
  for (const { key, settings } of allSettings()) userSettings.set(key, JSON.parse(settings));
}

export function createState(channelId: string, ownerId: string): TempChannelState {
  const state: TempChannelState = {
    ownerId,
    trusted: new Set(),
    blocked: new Set(),
    locked: false,
    hidden: false,
    chatLocked: false,
    waiting: false,
    waitingChannelId: null,
    lastRename: 0,
    threadId: null,
  password: null,
  };
  states.set(channelId, state);
  putState(channelId, serState(state));
  return state;
}

export function getState(channelId: string): TempChannelState | undefined {
  return states.get(channelId);
}

export function saveState(channelId: string): void {
  const state = states.get(channelId);
  if (state) putState(channelId, serState(state));
}

export function rmState(channelId: string): void {
  const state = states.get(channelId);
  if (state?.waitingChannelId) waitingRooms.delete(state.waitingChannelId);
  if (!states.has(channelId)) return;
  states.delete(channelId);
  dbDeleteState(channelId);
}

export function regWaiting(waitingChannelId: string, tempChannelId: string): void {
  waitingRooms.set(waitingChannelId, tempChannelId);
  addWaiting(waitingChannelId, tempChannelId);
}

export function unregWaiting(waitingChannelId: string): void {
  waitingRooms.delete(waitingChannelId);
  dbRemoveWaitingRoom(waitingChannelId);
}

export function waitingTarget(waitingChannelId: string): string | undefined {
  return waitingRooms.get(waitingChannelId);
}

export function isWaitingRoom(channelId: string): boolean {
  return waitingRooms.has(channelId);
}

export interface UserSettings {
  name?: string;
  limit?: number;
  region?: string | null;
}

const userSettings = new Map<string, UserSettings>();

function settingsKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function saveSettings(guildId: string, userId: string, settings: UserSettings): void {
  const key = settingsKey(guildId, userId);
  const current = userSettings.get(key) ?? {};
  const merged = { ...current, ...settings };
  userSettings.set(key, merged);
  putSettings(key, JSON.stringify(merged));
}

export function getSettings(guildId: string, userId: string): UserSettings {
  return userSettings.get(settingsKey(guildId, userId)) ?? {};
}