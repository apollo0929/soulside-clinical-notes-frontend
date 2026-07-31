declare const __brand: unique symbol

/**
 * Nominal branding for otherwise identical primitive types.
 * Runtime values remain plain strings/numbers; the brand exists only in the type system.
 */
export type Brand<T, TBrand extends string> = T & {
  readonly [__brand]: TBrand
}
