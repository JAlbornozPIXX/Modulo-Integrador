/** @jsx React.createElement */
"use client";

import {Button, Description, FieldError, Form, Input, Label, TextField} from "@heroui/react";

const SignUp =() => {
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
        className={"w-full"}
        isRequired
        name="email"
        type="email"
        validate={(value) => {
          if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
            return "Please enter a valid email address";
          }

          return null;
        }}
      >
        <Label>Email</Label>
        <Input placeholder="john@ucm.cl" />
        <FieldError />
      </TextField>

      <TextField
        isRequired
        minLength={8}
        name="password"
        type="password"
        validate={(value) => {
          if (value.length < 8) {
            return "Password must be at least 8 characters";
          }
          if (!/[A-Z]/.test(value)) {
            return "Password must contain at least one uppercase letter";
          }
          if (!/[0-9]/.test(value)) {
            return "Password must contain at least one number";
          }

          return null;
        }}
      >
        <Label>Contraseña</Label>
        <Input placeholder="Ingresa tu contraseña" />
        <Description>Debe tener al menos 8 caracteres, incluyendo 1 mayúscula y 1 número.</Description>
        <FieldError />
      </TextField>

            <div className="flex gap-2">
        <Button type="submit">Crear Cuenta</Button>
        <Button type="reset" variant="secondary">Cancelar</Button>
      </div>
    </div>
    </Form>
  );
}

export default SignUp;