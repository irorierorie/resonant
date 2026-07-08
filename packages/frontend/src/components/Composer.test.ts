import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveAttachments,
  type PendingAttachment,
  type PersistedAttachment,
} from './attachmentUtils.js';

// Regression guard for the mobile attach->send drop. The composer's React
// `attachments` state can be wiped by a remount (the photo-picker suspending the
// tab on mobile). The per-thread persisted copy survives. resolveEffectiveAttachments
// MUST fall back to the persisted copy when live state is empty — otherwise the
// attachment is silently dropped and the message sends with no image.

const img = (id: string): PendingAttachment => ({
  fileId: id,
  filename: `${id}.png`,
  contentType: 'image',
  url: `/api/files/${id}`,
  previewUrl: `blob:${id}`,
});

const persistedImg = (id: string): PersistedAttachment => ({
  fileId: id,
  filename: `${id}.png`,
  contentType: 'image',
  url: `/api/files/${id}`,
});

describe('resolveEffectiveAttachments', () => {
  it('uses live state when it has attachments', () => {
    const state = [img('a')];
    const persisted = [persistedImg('b')];
    expect(resolveEffectiveAttachments(state, persisted)).toBe(state);
  });

  it('falls back to persisted when live state is empty (the mobile drop bug)', () => {
    const persisted = [persistedImg('b')];
    const result = resolveEffectiveAttachments([], persisted);
    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('b');
  });

  it('returns empty when both sources are empty', () => {
    expect(resolveEffectiveAttachments([], [])).toEqual([]);
  });

  it('prefers live state over persisted when both are non-empty', () => {
    const state = [img('a')];
    const persisted = [persistedImg('b')];
    const result = resolveEffectiveAttachments(state, persisted);
    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('a');
  });
});
