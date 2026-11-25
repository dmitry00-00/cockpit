import northPilotAdventure from '../../content/campaigns/asoiaf-north-pilot.json';
import type { ImportedContent } from '../engine/state';
import { parseAdventureBundle, type AdventureBundle } from './adventure';

export interface BuiltInCampaign {
  id: string;
  version: string;
  title: string;
  settingPackageId: string;
  entryLocationId: string;
  description: string;
  sourceFile: string;
  adventure: AdventureBundle;
}

const northPilotBundle = parseAdventureBundle(northPilotAdventure);

export const BUILT_IN_CAMPAIGNS: readonly BuiltInCampaign[] = [{
  id: 'asoiaf-north-pilot',
  version: '1.0.0',
  title: 'Север: королевский визит · книжный срез после Catelyn I',
  settingPackageId: 'planetos',
  entryLocationId: 'winterfell',
  description: 'Системно-нейтральный мастерский сценарий в Винтерфелле. Игровая линия с обозом авторская, а не каноническая; правила и герои партии задаются отдельно.',
  sourceFile: 'content/campaigns/asoiaf-north-pilot.json',
  adventure: northPilotBundle,
}];

export function builtInCampaignForId(id: string | undefined): BuiltInCampaign | undefined {
  return id ? BUILT_IN_CAMPAIGNS.find(campaign => campaign.id === id) : undefined;
}

/** Campaign roots may preload authored content into the neutral catalog; launch remains a separate proposal. */
export function builtInCampaignContent(id: string, adventureSnapshot?: AdventureBundle): ImportedContent {
  const campaign = builtInCampaignForId(id);
  const adventure = adventureSnapshot ?? campaign?.adventure;
  if (!adventure || adventure.id !== id) throw new Error(`Пакет кампании не найден: ${id}`);
  return {
    id: adventure.id,
    kind: 'adventure',
    name: adventure.title,
    sourceFormat: 'json',
    sourceFile: campaign?.sourceFile ?? `content/campaigns/${id}.json`,
    data: adventure as unknown as Readonly<Record<string, unknown>>,
  };
}
