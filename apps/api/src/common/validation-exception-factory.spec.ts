import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { IsEmail } from "class-validator";
import { validationExceptionFactory } from "./validation-exception-factory";

class SampleDto {
  @IsEmail()
  email!: string;
}

describe("validationExceptionFactory", () => {
  it("maps class-validator errors into VALIDATION_FAILED with field details", async () => {
    const instance = plainToInstance(SampleDto, { email: "not-an-email" });
    const errors = await validate(instance);

    const exception = validationExceptionFactory(errors);

    expect(exception.code).toBe("VALIDATION_FAILED");
    expect(exception.getStatus()).toBe(400);
    expect(exception.details).toEqual([{ field: "email", message: expect.any(String) }]);
  });
});
