import { z } from 'zod'
import { ROOM_IDS, SUSPECT_IDS, WEAPON_IDS } from './constants'

const suspectId = z.enum(SUSPECT_IDS as unknown as [string, ...string[]])
const weaponId = z.enum(WEAPON_IDS as unknown as [string, ...string[]])
const roomId = z.enum(ROOM_IDS as unknown as [string, ...string[]])
const cardKey = z.custom<string>((v) => typeof v === 'string' && /^(suspect|weapon|room):[a-z_]+$/.test(v))

const coord = z.object({ c: z.number().int().min(0).max(23), r: z.number().int().min(0).max(24) })

/**
 * Ogni intento che un telefono può inviare all'host.
 *
 * Sono validati con zod al confine di rete: la TV non si fida mai del payload
 * ricevuto, ricalcola sempre la legalità della mossa con il reducer.
 */
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JOIN'),
    playerId: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(24),
    suspect: suspectId,
  }),
  z.object({ type: z.literal('LEAVE'), playerId: z.string() }),
  z.object({ type: z.literal('SET_CONNECTED'), playerId: z.string(), connected: z.boolean() }),
  z.object({ type: z.literal('RENAME'), playerId: z.string(), name: z.string().trim().min(1).max(24) }),
  z.object({
    type: z.literal('SET_CONFIG'),
    config: z.object({
      classicWeaponPlacement: z.boolean().optional(),
      suggestionMoveGrantsSuggestion: z.boolean().optional(),
      diceCount: z.union([z.literal(1), z.literal(2)]).optional(),
      turnTimeLimit: z.number().int().min(0).max(600).optional(),
    }),
  }),
  z.object({ type: z.literal('START_GAME') }),
  z.object({ type: z.literal('ROLL_DICE'), playerId: z.string() }),
  z.object({
    type: z.literal('MOVE_TO'),
    playerId: z.string(),
    target: z.union([
      z.object({ kind: z.literal('corridor'), at: coord }),
      z.object({ kind: z.literal('room'), room: roomId }),
    ]),
  }),
  z.object({ type: z.literal('USE_SECRET_PASSAGE'), playerId: z.string() }),
  z.object({
    type: z.literal('MAKE_SUGGESTION'),
    playerId: z.string(),
    suspect: suspectId,
    weapon: weaponId,
  }),
  z.object({ type: z.literal('SHOW_CARD'), playerId: z.string(), card: cardKey }),
  z.object({ type: z.literal('ACKNOWLEDGE'), playerId: z.string() }),
  z.object({
    type: z.literal('MAKE_ACCUSATION'),
    playerId: z.string(),
    suspect: suspectId,
    weapon: weaponId,
    room: roomId,
  }),
  z.object({ type: z.literal('END_TURN'), playerId: z.string() }),
  z.object({ type: z.literal('RESET') }),
])

export type Action = z.infer<typeof ActionSchema>
export type ActionType = Action['type']

export function parseAction(raw: unknown): Action | null {
  const result = ActionSchema.safeParse(raw)
  return result.success ? (result.data as Action) : null
}
