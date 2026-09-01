/** @jsx React.createElement */
"use client";

import {Button, Description, FieldError, Form, Input, Label, TextField} from "@heroui/react";

const ResetPassword = () => {
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, string> = {};

    // Convert FormData to plain object
    formData.forEach((value, key) => {
      data[key] = value.toString();
    });

    alert(`Form submitted with: ${JSON.stringify(data, null, 2)}`);
  };

  return (
    <Form className="flex min-h-screen w-full items-center justify-center" onSubmit={onSubmit}>
      <div className="flex flex-col gap-4 w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 [backdrop-filter:var(--glass-backdrop)]">

      <TextField
        isRequired
        minLength={8}
        name="password"
        type="password"
        validate={(value) => {
          if (value.length < 8) {
            return "La contraseña debe tener al menos 8 caracteres";
          }
          if (!/[A-Z]/.test(value)) {
            return "La contraseña debe tener al menos una mayúscula";
          }
          if (!/[0-9]/.test(value)) {
            return "La contraseña debe tener al menos un número";
          }

          return null;
        }}
      >
        <Label>Nueva contraseña</Label>
        <Input placeholder="Ingresa tu nueva contraseña" />
        <Description>Debe tener al menos 8 caracteres, incluyendo 1 mayúscula y 1 número.</Description>
        <FieldError />
      </TextField>

            <div className="flex gap-2">
        <Button type="submit">Restablecer contraseña</Button>
      </div>
    </div>
    </Form>
  );
}

export default ResetPassword;
