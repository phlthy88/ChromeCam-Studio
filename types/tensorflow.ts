// types/tensorflow.ts
/**
 * @license
 * Copyright 2024 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

export interface Tf {
  getBackend(): string;
  setBackend(backendName: string): Promise<boolean>;
  ready(): Promise<void>;
  // Allow other properties
  [key: string]: any;
}

// Keep the old name as an alias if needed, or just for backward compatibility if used elsewhere (though search showed only utils/tfLoader.ts using the file)
export type TensorFlowLibrary = Tf;