// Category-specific labels, hints and guides for the website-cms item editor.
// Each category maps to the page where its items appear on ventogroup.co.

export type CategoryMeta = {
  pageLabel: string;
  pageUrl: string;
  titleLabel: string;
  titleHint: string;
  excerptLabel: string;
  excerptHint: string;
  locationLabel: string;
  locationHint: string;
  scheduleLabel: string;
  scheduleHint: string;
  ctaLabelHint: string;
  ctaUrlHint: string;
  guide: string[];
};

export type ItemCategory = "restaurant" | "job" | "service" | "event" | "app";

export const CATEGORY_META: Record<ItemCategory, CategoryMeta> = {
  restaurant: {
    pageLabel: "ventogroup.co/restaurantes",
    pageUrl: "/restaurantes",
    titleLabel: "Nombre del restaurante",
    titleHint: "Aparece como título de la tarjeta y en el detalle del restaurante.",
    excerptLabel: "Descripción corta",
    excerptHint: "2-3 líneas que aparecen en la tarjeta de /restaurantes. Ej: Cocina japonesa de autor en el corazon de la Zona G.",
    locationLabel: "Ubicación",
    locationHint: "Ej: Bogota - Zona G. Aparece en la tarjeta y en el detalle.",
    scheduleLabel: "Horario",
    scheduleHint: "Ej: Lunes a sabado 12:00 - 23:00. Aparece en el detalle del restaurante.",
    ctaLabelHint: "Texto del boton. Ej: Reservar / Ver menu.",
    ctaUrlHint: "URL de reservas (OpenTable, The Fork) o link del menu. Deja vacio para el detalle interno.",
    guide: [
      "FOTO: Sube una foto horizontal de alta calidad (mínimo 1200x800 px). Evita logos.",
      "TEXTO: Escribe una descripción de 2-3 líneas que evoque el ambiente y la cocina.",
      "UBICACIÓN: Confirma la ubicación. Formato: Ciudad - Barrio (ej: Bogota - Zona G).",
      "HORARIO: Agrega el horario completo para que los clientes sepan cuando visitarlos.",
      "BOTON: Pega la URL de reservas o menu en Link del boton. Si no tienes, deja #.",
      "PUBLICAR: Activa Publicado cuando el restaurante este listo para aparecer en el sitio.",
    ],
  },
  job: {
    pageLabel: "ventogroup.co/empleos",
    pageUrl: "/empleos",
    titleLabel: "Nombre del puesto",
    titleHint: "Ej: Jefe de cocina / Bartender - Turno noche. Aparece como título en la lista.",
    excerptLabel: "Descripción del cargo",
    excerptHint: "Resumen de 2-3 líneas: responsabilidades principales y perfil buscado. Aparece en la tarjeta de /empleos.",
    locationLabel: "Sede o modalidad",
    locationHint: "Ej: Bogota - Zona T / Remoto. Aparece junto al título del puesto.",
    scheduleLabel: "Tipo de contrato",
    scheduleHint: "Ej: Tiempo completo / Medio tiempo / Temporal. Aparece en la tarjeta.",
    ctaLabelHint: "Texto del boton. Ej: Aplicar ahora / Ver requisitos.",
    ctaUrlHint: "Link de la convocatoria, formulario de Google, correo mailto: o URL externa.",
    guide: [
      "PUESTO: Escribe el nombre exacto del puesto tal como aparecera en el aviso.",
      "SEDE: Indica la sede o si es remoto para que el candidato sepa desde el inicio.",
      "DESCRIPCIÓN: Resume las 3-5 responsabilidades principales del cargo.",
      "CONTRATO: En Tipo de contrato escribe: Tiempo completo, Medio tiempo o Temporal.",
      "LINK: En Link de postulacion pega la URL del formulario o escribe mailto:empleos@ventogroup.co",
      "PUBLICAR: Activa Publicado y guarda. La vacante aparecera de inmediato en /empleos.",
      "CERRAR: Cuando se cubra el puesto, desactiva Publicado para quitarlo del sitio.",
    ],
  },
  service: {
    pageLabel: "ventogroup.co/servicios",
    pageUrl: "/servicios",
    titleLabel: "Nombre del servicio",
    titleHint: "Aparece como título de la tarjeta en /servicios.",
    excerptLabel: "Descripción corta",
    excerptHint: "1-2 líneas que explican que hace este servicio. Aparece en la tarjeta.",
    locationLabel: "Disponibilidad / Area",
    locationHint: "Ej: Nacional / Solo Bogota / En linea.",
    scheduleLabel: "Modalidad",
    scheduleHint: "Ej: Mensual / Por proyecto / 24/7.",
    ctaLabelHint: "Ej: Conocer servicio / Solicitar.",
    ctaUrlHint: "URL de mas informacion o formulario de contacto.",
    guide: [
      "IMAGEN: Sube una imagen que represente el servicio (icono, foto de equipo o resultado).",
      "TEXTO: Describe en 2 lineas que resuelve este servicio y para quien es.",
      "LINK: Agrega un link para que interesados puedan contactar o conocer mas.",
      "PUBLICAR: Activa Publicado para que aparezca en /servicios.",
    ],
  },
  event: {
    pageLabel: "ventogroup.co/eventos",
    pageUrl: "/eventos",
    titleLabel: "Nombre del evento",
    titleHint: "Ej: Cena de maridaje - Casa Vento. Aparece en la tarjeta de /eventos.",
    excerptLabel: "Descripción del evento",
    excerptHint: "Que es, cuando y por que asistir. 2-3 líneas. Aparece en la tarjeta.",
    locationLabel: "Lugar",
    locationHint: "Ej: Casa Vento - Zona G / Por confirmar.",
    scheduleLabel: "Fecha y hora",
    scheduleHint: "Ej: Sabado 14 jun - 7:00 PM. Aparece junto al nombre del evento.",
    ctaLabelHint: "Ej: Reservar cupo / Mas informacion.",
    ctaUrlHint: "Link de inscripcion, WhatsApp o pagina del evento.",
    guide: [
      "FOTO: Usa una foto del venue o del tipo de experiencia (alta calidad).",
      "FECHA: En Fecha y hora escribe la fecha y hora en texto natural para que sea legible.",
      "DESCRIPCIÓN: Explica qué vivirá el asistente en 2-3 lineas.",
      "LINK: Agrega el link de inscripcion o reserva.",
      "PUBLICAR: Activa Publicado. Cuando el evento termine, desactivalo.",
    ],
  },
  app: {
    pageLabel: "ventogroup.co/ecosistema",
    pageUrl: "/ecosistema",
    titleLabel: "Nombre de la app",
    titleHint: "Aparece en la tarjeta de /ecosistema.",
    excerptLabel: "Descripción corta",
    excerptHint: "1-2 líneas que explican para que es la app.",
    locationLabel: "Plataforma",
    locationHint: "Ej: iOS - Android / Web.",
    scheduleLabel: "Estado",
    scheduleHint: "Ej: Disponible / Proximamente.",
    ctaLabelHint: "Ej: Descargar / Abrir.",
    ctaUrlHint: "URL de App Store, Play Store o acceso web.",
    guide: [
      "ICONO: Sube el icono o captura de pantalla de la app.",
      "TEXTO: Describe en 1-2 lineas el proposito de la app.",
      "LINK: Agrega el link de descarga o acceso.",
      "PUBLICAR: Activa Publicado para que aparezca en /ecosistema.",
    ],
  },
};
