import {
  Transport,
  Chain,
  Client,
  Address,
  Account,
  concatHex,
  encodeFunctionData,
} from "viem";
import { toAccount } from "viem/accounts";
import { signMessage, signTypedData } from "viem/actions";
import { getChainId, getBytecode } from "viem/actions";
import { getAccountInitCode } from "../../test/userOp";
import { getAccountNonce, getUserOperationHash } from "../_types";
import {
  SmartAccountSigner,
  KernelEcdsaSmartAccount,
  SignTransactionNotSupportedBySmartAccount,
} from "../accounts";
import { KernelExecuteAbi } from "../accounts/kernel/abi/KernelAccountAbi";
import { KERNEL_ADDRESSES } from "../accounts/kernel/signerToEcdsaKernelSmartAccount";
import { KernelPlugin } from "./types";

export async function signerToEcdsaValidator<
  TTransport extends Transport = Transport,
  TChain extends Chain | undefined = Chain | undefined
>(
  client: Client<TTransport, TChain>,
  {
    signer,
    entryPoint,
    validatorAddress = KERNEL_ADDRESSES.ECDSA_VALIDATOR,
  }: {
    signer: SmartAccountSigner;
    entryPoint: Address;
    accountLogicAddress?: Address;
    validatorAddress?: Address;
  }
): Promise<KernelPlugin<"ECDSAValidator", TTransport, TChain>> {
  // Get the private key related account
  const viemSigner: Account =
    signer.type === "local"
      ? ({
          ...signer,
          signTransaction: (_, __) => {
            throw new SignTransactionNotSupportedBySmartAccount();
          },
        } as Account)
      : (signer as Account);

  // Fetch chain id
  const [chainId] = await Promise.all([getChainId(client)]);

  // Build the EOA Signer
  const account = toAccount({
    address: validatorAddress,
    async signMessage({ message }) {
      return signMessage(client, { account: viemSigner, message });
    },
    async signTransaction(_, __) {
      throw new SignTransactionNotSupportedBySmartAccount();
    },
    async signTypedData(typedData) {
      return signTypedData(client, { account: viemSigner, ...typedData });
    },
  });

  return {
    ...account,
    signer: viemSigner,
    client: client,
    entryPoint: entryPoint,
    source: "ECDSAValidator",

    async getNonceKey() {
      return 0n;
    },
    // Sign a user operation
    async signUserOperation(userOperation) {
      const hash = getUserOperationHash({
        userOperation: {
          ...userOperation,
          signature: "0x",
        },
        entryPoint: entryPoint,
        chainId: chainId,
      });
      const signature = await signMessage(client, {
        account: viemSigner,
        message: { raw: hash },
      });
      // Always use the sudo mode, since we will use external paymaster
      return concatHex(["0x00000000", signature]);
    },

    // Get simple dummy signature
    async getDummySignature() {
      return "0x00000000fffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";
    },
  };
}
