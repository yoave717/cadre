export {
  ImageInput,
  ImageDetection,
  detectImages,
  loadImage,
  loadImageFromFile,
  loadImageFromUrl,
  hasClipboardImage,
  getClipboardImage,
  formatImageForApi,
} from './image.js';

export {
  InputMode,
  MultiLineResult,
  MultiLineHandler,
  BracketedPasteHandler,
  getModePrompt,
} from './multiline.js';

export { LineEditor, LineEditorOptions } from './line-editor.js';
export { HistoryManager } from './history-manager.js';
export {
  getCompletions,
  getCommandSuggestions,
  getInlineSuggestion,
  CompletionResult,
} from './completion.js';
