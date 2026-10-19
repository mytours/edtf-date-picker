import type { Config } from './config.js'
import { message } from './messages.js'
import { finish, incomplete, parseErrorMessage, type Result } from './result.js'

/** Checks and describes an EDTF value typed in advanced mode, or loaded from a host */
export function analyse(input: string, config: Config): Result {
  const value = input.trim()
  if (!value) return incomplete(message('empty-edtf'))
  return finish(value, config, [], (e) => parseErrorMessage(e, value))
}
