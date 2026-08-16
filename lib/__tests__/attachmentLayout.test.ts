import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const STRIP = readFileSync('components/game/AttachmentStrip.tsx', 'utf8');
const LANE = readFileSync('components/game/MissionLane.tsx', 'utf8');

describe('attachments are laid out exactly like the printed reference', () => {
  it('an attachment is never turned on its side, it is printed to be tucked behind as is', () => {
    expect(STRIP, 'no quarter turn anywhere').not.toContain('90}deg)');
    expect(STRIP, 'only the opponent side is mirrored').toContain('rotate(${mine ? 0 : 180}deg)');
  });

  it('a mission attachment slides out along the vertical axis, keeping its landscape shape', () => {
    expect(STRIP).toContain('const MISSION_DRIFT_PCT');
    expect(STRIP, 'the big shift is the vertical one on a mission')
      .toContain('translate(${towardsMe * MISSION_DRIFT_PCT}%, ${towardsMe * shiftPct}%)');
  });

  it('mine leaves by the right, the opponent one by the left', () => {
    expect(STRIP, 'one shift, mirrored by owner').toContain('const towardsMe = mine ? 1 : -1;');
    expect(STRIP).toContain('translate(${towardsMe * shiftPct}%');
  });

  it('it is exactly the size of the card it hangs on, never a shrunken copy', () => {
    expect(STRIP, 'it simply fills the host box').toContain('inset: 0');
    expect(STRIP, 'no width is imposed on it').not.toContain('width: cardWidth');
    expect(STRIP, 'no height either').not.toContain('height: cardHeight');
    expect(LANE, 'and the lane hands it no size at all').not.toContain('cardWidth={');
  });

  it('it leaves from under the mission, not from its side', () => {
    expect(STRIP, 'mine drops below, the opponent one rises above')
      .toContain('const towardsMe = mine ? 1 : -1;');
    expect(STRIP).toContain('export const MISSION_VISIBLE_RATIO = 0.4;');
  });

  it('it stays behind the card it belongs to', () => {
    expect(STRIP).toContain('zIndex: 0');
  });

  it('a slot carrying an attachment is lifted above its neighbours, so nothing can cover it', () => {
    expect(STRIP, 'the two slot layers are named once and shared')
      .toContain('export const SLOT_LAYER = 1;');
    expect(STRIP).toContain('export const SLOT_WITH_ATTACHMENT_LAYER = 3;');
    expect(LANE, 'a character slot lifts itself only when it carries something')
      .toContain('zIndex: (character.attachments ?? []).length > 0 ? SLOT_WITH_ATTACHMENT_LAYER : SLOT_LAYER,');
    expect(LANE, 'a mission slot does the same')
      .toContain('zIndex: (mission.attachments ?? []).length > 0 ? SLOT_WITH_ATTACHMENT_LAYER : SLOT_LAYER,');
  });

  it('several attachments fan out instead of hiding one another', () => {
    expect(STRIP).toContain('const FAN_PCT = 5;');
  });

  it('it drifts towards the empty side of its row, never past the clipped edge', () => {
    expect(STRIP, 'the vertical drift follows the row the host sits in')
      .toContain('const towardsFreeSpace = hostIsOwn ? 1 : -1;');
    expect(LANE, 'the lane tells the strip which row its host is on')
      .toContain('hostIsOwn={isOwn}');
    expect(LANE, 'my row stacks from the top, so there is room below')
      .toContain('content-start');
    expect(LANE, 'the enemy row stacks from the bottom, so there is room above')
      .toContain('content-end');
  });

  it('hovering one shows it in the detail panel, clicking pins it', () => {
    expect(STRIP).toContain('onMouseEnter');
    expect(LANE.split('onHover={(x, y) => showPreview').length - 1, 'characters and missions both preview').toBe(2);
    expect(LANE.split('onClick={() => pinCard').length - 1).toBe(2);
  });

  it('characters and missions share one layout, each with its own card shape', () => {
    expect(LANE.split('<AttachmentStrip').length - 1).toBe(2);
    expect(STRIP, 'the shape comes from the card itself').toContain('isLandscapeCard(card)');
    expect(STRIP, 'a character attachment drifts diagonally instead')
      .toContain('translate(${towardsMe * shiftPct}%, ${towardsFreeSpace * (CHARACTER_DRIFT_PCT + fan)}%)');
    expect(LANE, 'no hand-rolled box is left behind').not.toContain("[mine ? 'right' : 'left']");
  });

  it('a card carrying an attachment pushes its neighbours aside', () => {
    expect(LANE).toContain('const attachmentRoom = useMemo');
    expect(LANE).toContain('marginRight: attachmentRoom.right');
    expect(LANE).toContain('marginLeft: attachmentRoom.left');
  });

  it('the whole layout is expressed in percentages, so it survives any board scale', () => {
    expect(STRIP, 'the shift is a share of the card, not a pixel count').toContain('shiftPct');
    expect(STRIP).not.toContain("+ 'px'");
    expect(LANE, 'the room reserved for it follows the card size')
      .toContain('dims.missionCard.h * CHARACTER_VISIBLE_RATIO');
  });
});
