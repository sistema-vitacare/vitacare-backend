import { Transform } from 'class-transformer';

export const DOCUMENT_PATTERN = /^(?=.*[0-9A-Za-z])[0-9A-Za-z./ -]+$/;

export const PHONE_PATTERN = /^[0-9+() -]+$/;

export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
