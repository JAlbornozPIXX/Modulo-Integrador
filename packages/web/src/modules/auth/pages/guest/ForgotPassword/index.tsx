/** @jsx React.createElement */
"use client";

import {Button, FieldError, Form, Input, Label, TextField} from "@heroui/react";
import { Link } from "react-router-dom";


const ForgotPassword =() => {
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

        <div className="flex gap-2">
            <Button type="submit">Enviar enlace de recuperación</Button>
        </div>


      <div className="flex flex-col gap-2 text-center text-sm">
        <Link to="/auth/sign-in" className="text-[var(--accent)] hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>


    </div>
    </Form>
  );
}

export default ForgotPassword;