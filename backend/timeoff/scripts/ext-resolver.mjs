export async function resolve(specifier, context, nextResolve) {
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
  if (specifier.startsWith('.') && !hasExtension) {
    try {
      return await nextResolve(specifier + '.js', context);
    } catch {
      // fall through to default resolution (handles directories / index files)
    }
  }
  return nextResolve(specifier, context);
}
