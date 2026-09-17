export default defineEventHandler(async (event) => {
  const album = await albumBySlug(getRouterParam(event, 'slug')!)

  if (!album)
    throw createError({ statusCode: 404, statusMessage: '找不到這本相簿' })

  return album
})
