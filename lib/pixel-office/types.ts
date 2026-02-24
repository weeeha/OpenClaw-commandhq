// Inlined constants (no longer imported from constants)
export const TILE_SIZE = 16
export const DEFAULT_COLS = 21
export const DEFAULT_ROWS = 17
export const MAX_COLS = 64
export const MAX_ROWS = 64
export const MATRIX_EFFECT_DURATION = 0.3

export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  FLOOR_5: 5,
  FLOOR_6: 6,
  FLOOR_7: 7,
  VOID: 8,
} as const
export type TileType = (typeof TileType)[keyof typeof TileType]

/** Per-tile color settings for floor pattern colorization */
export interface FloorColor {
  /** Hue: 0-360 in colorize mode, -180 to +180 in adjust mode */
  h: number
  /** Saturation: 0-100 in colorize mode, -100 to +100 in adjust mode */
  s: number
  /** Brightness -100 to 100 */
  b: number
  /** Contrast -100 to 100 */
  c: number
  /** When true, use Photoshop-style Colorize (grayscale → fixed HSL). Default: adjust mode. */
  colorize?: boolean
}

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
} as const
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState]

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const
export type Direction = (typeof Direction)[keyof typeof Direction]

/** 2D array of hex color strings (or '' for transparent). [row][col] */
export type SpriteData = string[][]

export interface Seat {
  /** Chair furniture uid */
  uid: string
  /** Tile col where agent sits */
  seatCol: number
  /** Tile row where agent sits */
  seatRow: number
  /** Direction character faces when sitting (toward adjacent desk) */
  facingDir: Direction
  assigned: boolean
}

export interface FurnitureInstance {
  sprite: SpriteData
  /** Pixel x (top-left) */
  x: number
  /** Pixel y (top-left) */
  y: number
  /** Y value used for depth sorting (typically bottom edge) */
  zY: number
}

export interface ToolActivity {
  toolId: string
  status: string
  done: boolean
  permissionWait?: boolean
}

export const FurnitureType = {
  DESK: 'desk',
  BOOKSHELF: 'bookshelf',
  PLANT: 'plant',
  COOLER: 'cooler',
  WHITEBOARD: 'whiteboard',
  CHAIR: 'chair',
  PC: 'pc',
  PC_BACK: 'pc_back',
  LAMP: 'lamp',
  // Tileset — Desks
  TABLE_WOOD_SM_VERTICAL: 'ts_table_wood_sm_vertical',
  TABLE_WOOD_SM_HORIZONTAL: 'ts_table_wood_sm_horizontal',
  // Tileset — Chairs
  CHAIR_CUSHION: 'ts_chair_cushion',
  CHAIR_SPINNING: 'ts_chair_spinning',
  BENCH: 'ts_bench',
  // Tileset — Decor
  WATER_COOLER: 'ts_water_cooler',
  FRIDGE: 'ts_fridge',
  DECO_3: 'ts_deco_3',
  CLOCK: 'ts_clock',
  LIBRARY_GRAY_FULL: 'ts_library_gray_full',
  PLANT_SMALL: 'ts_plant_small',
  PAINTING_LARGE_1: 'ts_painting_large_1',
  PAINTING_LARGE_2: 'ts_painting_large_2',
  PAINTING_SMALL_1: 'ts_painting_small_1',
  PAINTING_SMALL_2: 'ts_painting_small_2',
  PAINTING_SMALL_3: 'ts_painting_small_3',
} as const
export type FurnitureType = (typeof FurnitureType)[keyof typeof FurnitureType]

export const EditTool = {
  TILE_PAINT: 'tile_paint',
  WALL_PAINT: 'wall_paint',
  FURNITURE_PLACE: 'furniture_place',
  FURNITURE_PICK: 'furniture_pick',
  SELECT: 'select',
  EYEDROPPER: 'eyedropper',
  ERASE: 'erase',
} as const
export type EditTool = (typeof EditTool)[keyof typeof EditTool]

export interface FurnitureCatalogEntry {
  type: string
  label: string
  footprintW: number
  footprintH: number
  sprite: SpriteData
  isDesk: boolean
  category?: string
  orientation?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
  canPlaceOnWalls?: boolean
}

export interface PlacedFurniture {
  uid: string
  type: string
  col: number
  row: number
  color?: FloorColor
}

export interface OfficeLayout {
  version: 1
  cols: number
  rows: number
  tiles: TileType[]
  furniture: PlacedFurniture[]
  tileColors?: Array<FloorColor | null>
}

export interface Character {
  id: number
  state: CharacterState
  dir: Direction
  x: number
  y: number
  tileCol: number
  tileRow: number
  path: Array<{ col: number; row: number }>
  moveProgress: number
  currentTool: string | null
  palette: number
  hueShift: number
  frame: number
  frameTimer: number
  wanderTimer: number
  wanderCount: number
  wanderLimit: number
  isActive: boolean
  seatId: string | null
  bubbleType: 'permission' | 'waiting' | null
  bubbleTimer: number
  seatTimer: number
  isSubagent: boolean
  parentAgentId: number | null
  label: string
  matrixEffect: 'spawn' | 'despawn' | null
  matrixEffectTimer: number
  matrixEffectSeeds: number[]
}
