import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdateUserUseCase } from "../../../src/modules/users/application/use-cases/update-user.use-case";
import { DeleteUserUseCase } from "../../../src/modules/users/application/use-cases/delete-user.use-case";
import { CreateUserUseCase } from "../../../src/modules/users/application/use-cases/create-user.use-case";
import type { UserRepository } from "../../../src/modules/users/application/interfaces/user-repository.interface";
import type { PasswordService } from "../../../src/modules/auth/application/interfaces/password-service.interface";
import {
  CannotGrantOwnerRoleError,
  InsufficientRoleHierarchyError,
  LastOwnerCannotBeRemovedError,
  SelfDeletionError,
} from "../../../src/modules/users/domain/errors/user.errors";

describe("SEC-02: Tenant User Role Hierarchy & Invariant Enforcement", () => {
  let mockUserRepo: UserRepository;
  let mockPasswordService: PasswordService;
  let updateUserUseCase: UpdateUserUseCase;
  let deleteUserUseCase: DeleteUserUseCase;
  let createUserUseCase: CreateUserUseCase;

  const tenantId = "tenant-uuid-1";

  beforeEach(() => {
    vi.clearAllMocks();

    mockUserRepo = {
      list: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      countOwners: vi.fn(),
    };

    mockPasswordService = {
      hash: vi.fn().mockResolvedValue("hashed-password"),
      compare: vi.fn().mockResolvedValue(true),
    };

    updateUserUseCase = new UpdateUserUseCase(mockUserRepo);
    deleteUserUseCase = new DeleteUserUseCase(mockUserRepo);
    createUserUseCase = new CreateUserUseCase(mockUserRepo, mockPasswordService);
  });

  describe("CreateUserUseCase", () => {
    it("prevents an ADMIN from creating a user with OWNER role", async () => {
      await expect(
        createUserUseCase.execute(
          tenantId,
          {
            email: "newowner@example.com",
            name: "New Owner",
            role: "OWNER",
          },
          "ADMIN",
        ),
      ).rejects.toThrow(CannotGrantOwnerRoleError);

      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it("allows an OWNER to create a user with OWNER role", async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(false);
      vi.mocked(mockUserRepo.create).mockResolvedValueOnce({
        id: "new-user-1",
        email: "newowner@example.com",
        name: "New Owner",
        role: "OWNER",
        createdAt: new Date(),
      });

      const result = await createUserUseCase.execute(
        tenantId,
        {
          email: "newowner@example.com",
          name: "New Owner",
          password: "StrongPassword123!",
          role: "OWNER",
        },
        "OWNER",
      );

      expect(result.role).toBe("OWNER");
      expect(mockUserRepo.create).toHaveBeenCalled();
    });

    it("allows an ADMIN to create a standard USER", async () => {
      vi.mocked(mockUserRepo.findByEmail).mockResolvedValueOnce(false);
      vi.mocked(mockUserRepo.create).mockResolvedValueOnce({
        id: "new-user-2",
        email: "member@example.com",
        name: "Regular Member",
        role: "USER",
        createdAt: new Date(),
      });

      const result = await createUserUseCase.execute(
        tenantId,
        {
          email: "member@example.com",
          name: "Regular Member",
          password: "StrongPassword123!",
          role: "USER",
        },
        "ADMIN",
      );

      expect(result.role).toBe("USER");
      expect(mockUserRepo.create).toHaveBeenCalled();
    });
  });

  describe("UpdateUserUseCase", () => {
    it("prevents an ADMIN from granting OWNER role to another user", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "target-user-1",
        email: "target@example.com",
        name: "Target User",
        role: "USER",
        createdAt: new Date(),
      });

      await expect(
        updateUserUseCase.execute(
          tenantId,
          "target-user-1",
          { role: "OWNER" },
          "ADMIN",
        ),
      ).rejects.toThrow(CannotGrantOwnerRoleError);

      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it("prevents an ADMIN from promoting themselves to OWNER", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "admin-user-1",
        email: "admin@example.com",
        name: "Admin User",
        role: "ADMIN",
        createdAt: new Date(),
      });

      await expect(
        updateUserUseCase.execute(
          tenantId,
          "admin-user-1",
          { role: "OWNER" },
          "ADMIN",
        ),
      ).rejects.toThrow(CannotGrantOwnerRoleError);

      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it("prevents an ADMIN from modifying an OWNER's details", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "owner-user-1",
        email: "owner@example.com",
        name: "Owner User",
        role: "OWNER",
        createdAt: new Date(),
      });

      await expect(
        updateUserUseCase.execute(
          tenantId,
          "owner-user-1",
          { name: "Hacked Owner" },
          "ADMIN",
        ),
      ).rejects.toThrow(InsufficientRoleHierarchyError);

      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it("prevents demoting the last remaining OWNER of the organization", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "sole-owner",
        email: "sole@example.com",
        name: "Sole Owner",
        role: "OWNER",
        createdAt: new Date(),
      });
      vi.mocked(mockUserRepo.countOwners).mockResolvedValueOnce(1);

      await expect(
        updateUserUseCase.execute(
          tenantId,
          "sole-owner",
          { role: "ADMIN" },
          "OWNER",
        ),
      ).rejects.toThrow(LastOwnerCannotBeRemovedError);

      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it("allows an OWNER to demote an OWNER if another OWNER exists", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "second-owner",
        email: "second@example.com",
        name: "Second Owner",
        role: "OWNER",
        createdAt: new Date(),
      });
      vi.mocked(mockUserRepo.countOwners).mockResolvedValueOnce(2);
      vi.mocked(mockUserRepo.update).mockResolvedValueOnce({
        id: "second-owner",
        email: "second@example.com",
        name: "Second Owner",
        role: "ADMIN",
        createdAt: new Date(),
      });

      const result = await updateUserUseCase.execute(
        tenantId,
        "second-owner",
        { role: "ADMIN" },
        "OWNER",
      );

      expect(result.role).toBe("ADMIN");
      expect(mockUserRepo.update).toHaveBeenCalledWith(tenantId, "second-owner", {
        role: "ADMIN",
      });
    });
  });

  describe("DeleteUserUseCase", () => {
    it("prevents a user from deleting their own membership", async () => {
      await expect(
        deleteUserUseCase.execute(tenantId, "user-1", "user-1", "OWNER"),
      ).rejects.toThrow(SelfDeletionError);

      expect(mockUserRepo.delete).not.toHaveBeenCalled();
    });

    it("prevents an ADMIN from deleting an OWNER", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "owner-1",
        email: "owner@example.com",
        name: "Owner User",
        role: "OWNER",
        createdAt: new Date(),
      });

      await expect(
        deleteUserUseCase.execute(tenantId, "admin-1", "owner-1", "ADMIN"),
      ).rejects.toThrow(InsufficientRoleHierarchyError);

      expect(mockUserRepo.delete).not.toHaveBeenCalled();
    });

    it("prevents deleting the last remaining OWNER of the organization", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "sole-owner",
        email: "sole@example.com",
        name: "Sole Owner",
        role: "OWNER",
        createdAt: new Date(),
      });
      vi.mocked(mockUserRepo.countOwners).mockResolvedValueOnce(1);

      await expect(
        deleteUserUseCase.execute(tenantId, "other-admin", "sole-owner", "OWNER"),
      ).rejects.toThrow(LastOwnerCannotBeRemovedError);

      expect(mockUserRepo.delete).not.toHaveBeenCalled();
    });

    it("allows deleting an OWNER if another OWNER exists", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "owner-2",
        email: "owner2@example.com",
        name: "Second Owner",
        role: "OWNER",
        createdAt: new Date(),
      });
      vi.mocked(mockUserRepo.countOwners).mockResolvedValueOnce(2);
      vi.mocked(mockUserRepo.delete).mockResolvedValueOnce(undefined);

      await deleteUserUseCase.execute(tenantId, "owner-1", "owner-2", "OWNER");

      expect(mockUserRepo.delete).toHaveBeenCalledWith(tenantId, "owner-2");
    });

    it("allows an ADMIN to delete a standard USER", async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValueOnce({
        id: "user-99",
        email: "user99@example.com",
        name: "User Ninety-Nine",
        role: "USER",
        createdAt: new Date(),
      });
      vi.mocked(mockUserRepo.delete).mockResolvedValueOnce(undefined);

      await deleteUserUseCase.execute(tenantId, "admin-1", "user-99", "ADMIN");

      expect(mockUserRepo.delete).toHaveBeenCalledWith(tenantId, "user-99");
    });
  });
});
