// @ts-expect-error - piexifjs não possui tipos
import piexif from "piexifjs";

export type ExifStamp = {
  lat: number | null;
  lng: number | null;
  estaca: string | null;
  street: string | null;
  date: Date;
};

function toDms(value: number) {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 10000);
  return [
    [deg, 1],
    [min, 1],
    [sec, 10000],
  ];
}

function fmt(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Grava metadados EXIF (coordenadas GPS, estaca, rua e data/hora) no JPEG.
 * Recebe e devolve um dataURL `data:image/jpeg;base64,...`.
 */
export function addExif(dataUrl: string, stamp: ExifStamp): string {
  try {
    const description = [stamp.estaca, stamp.street].filter(Boolean).join(" · ");
    const zeroth: Record<number, unknown> = {
      [piexif.ImageIFD.Make]: "EstacaGPS",
      [piexif.ImageIFD.Software]: "EstacaGPS by Vitor Lucas",
      [piexif.ImageIFD.Orientation]: 1,
      [piexif.ImageIFD.DateTime]: fmt(stamp.date),
    };
    if (description) zeroth[piexif.ImageIFD.ImageDescription] = description;

    const exif: Record<number, unknown> = {
      [piexif.ExifIFD.DateTimeOriginal]: fmt(stamp.date),
      [piexif.ExifIFD.DateTimeDigitized]: fmt(stamp.date),
      [piexif.ExifIFD.UserComment]: `ASCII\0\0\0${JSON.stringify({
        estaca: stamp.estaca,
        rua: stamp.street,
        lat: stamp.lat,
        lng: stamp.lng,
        timestamp: stamp.date.toISOString(),
      })}`,
    };

    const gps: Record<number, unknown> = {};
    if (stamp.lat !== null && stamp.lng !== null) {
      gps[piexif.GPSIFD.GPSLatitudeRef] = stamp.lat >= 0 ? "N" : "S";
      gps[piexif.GPSIFD.GPSLatitude] = toDms(stamp.lat);
      gps[piexif.GPSIFD.GPSLongitudeRef] = stamp.lng >= 0 ? "E" : "W";
      gps[piexif.GPSIFD.GPSLongitude] = toDms(stamp.lng);
      gps[piexif.GPSIFD.GPSDateStamp] = fmt(stamp.date).split(" ")[0];
    }

    const bytes = piexif.dump({ "0th": zeroth, Exif: exif, GPS: gps });
    return piexif.insert(bytes, dataUrl);
  } catch {
    return dataUrl;
  }
}
