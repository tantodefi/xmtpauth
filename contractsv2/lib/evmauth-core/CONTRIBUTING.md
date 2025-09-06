# Contributing to EVMAuth

Thank you for your interest in contributing to EVMAuth! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Issues](#reporting-issues)
- [Development Workflow](#development-workflow)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
- [Running Tests](#running-tests)
- [Coverage Reports](#coverage-reports)
- [Documentation](#documentation)
- [ABI & Bytecode](#abi--bytecode)
- [Additional Resources](#additional-resources)
- [Questions?](#questions)
- [License](#license)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you are expected to uphold this code. Please report unacceptable behavior to:
[opensource@radiustech.xyz](mailto:opensource@radiustech.xyz).

## Reporting Issues

We use GitHub issues to track bugs, feature requests, and documentation improvements.

Please use our issue templates when creating a new issue:

- **Bug Report**: Use this template for reporting bugs or unexpected behavior
- **Feature Request**: Use this template for suggesting new features or enhancements
- **Documentation**: Use this template for reporting issues with documentation

These structured templates help us gather the information we need to address your issue efficiently.

## Development Workflow

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/evmauth-core.git`
3. Create a new branch: `git checkout -b my-feature`
4. Make your changes
5. Run `forge fmt` and `forge test` to ensure code is formatted and tests pass
6. Push to your fork and submit a pull request

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation only
- `style:` Code style changes
- `refactor:` Non-bug-fixing code changes
- `test:` Test updates
- `chore:` Build process updates

## Pull Requests

We have specialized templates for different types of contributions. When creating a pull request, choose the template that best fits your contribution:

- **Default Template**: For general changes
- **Feature Template**: For adding new features
- **Bugfix Template**: For bug fixes
- **Documentation Template**: For documentation updates

You can select a specific template by adding `?template=template_name.md` to your PR creation URL. For example:
`https://github.com/radiustech/evmauth-core/compare/main...your-branch?template=feature.md`

All pull requests should include:

1. Clear title following conventional commits
2. Detailed description of changes
3. Reference related issues
4. Update documentation
5. Add tests
6. Update CHANGELOG.md
7. Ensure CI checks pass

## Getting Started

### Prerequisites

- [Solidity](https://docs.soliditylang.org/en/v0.8.0/installing-solidity.html)
- [Foundry](https://getfoundry.sh/)

### Setup

1. Clone the repository:

```sh
git clone git@github.com:evmauth/evmauth-core.git
```

2. Navigate to the project directory:

```sh
cd evmauth-core
```

3. Install the dependencies:

```sh
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts-upgradeable
forge install OpenZeppelin/openzeppelin-foundry-upgrades
```

## Running Tests

To run the tests, use the following command:

```sh
forge test
```

It is a good practice to format the code before running tests:

```sh
forge fmt && forge test
```

Use the `--force` flag to recompile the contracts before running the tests:

```sh
forge fmt && forge test --force
```

To run tests with detailed output, use the `-vv`, `-vvv`, or `-vvvv` flag:

```sh
forge fmt && forge test -vvv
```

To specify a particular test file, use the `--match-path` option:

```sh
forge fmt && forge test --match-path test/YourTestFile.t.sol
```

To specify a particular test function, use the `--match-test` option:

```sh
forge fmt && forge test --match-test testFunctionName
```

More options can be found in the [Forge Docs](https://getfoundry.sh/forge/reference/test).

## Coverage Reports

To generate a coverage report, use:

```sh
forge fmt && forge coverage
```

You can use the same flags as in the test command to customize the coverage report.

More options can be found in the [Forge Docs](https://getfoundry.sh/forge/reference/coverage).

## Documentation

To generate the documentation site, use:

```sh
forge doc --serve --open
```

This will create a `docs` directory with the generated documentation and open it in your default web browser.

To watch for changes and automatically regenerate the documentation, use the `--watch` (or `-w`) option:

```sh
forge doc -w -s --open
```

To include external libraries in the documentation, use the `--include` (or `-i`) option:

```sh
forge doc -i -s --open
```

More options can be found in the [Forge Docs](https://getfoundry.sh/forge/reference/doc).

## ABI & Bytecode

To generate the full ABI for a contract, use:

```sh
forge inspect src/EVMAuth1155.sol:EVMAuth1155 abi --json > src/EVMAuth1155.abi
forge inspect src/EVMAuth6909.sol:EVMAuth6909 abi --json > src/EVMAuth6909.abi
```

To generate bytecode for a contract, use:

```sh
forge inspect src/EVMAuth1155.sol:EVMAuth1155 bytecode > src/EVMAuth1155.bin
forge inspect src/EVMAuth6909.sol:EVMAuth6909 bytecode > src/EVMAuth6909.bin
```

More options can be found in the [Forge Docs](https://getfoundry.sh/forge/reference/inspect).

## Additional Resources

- [Intro to Smart Contracts](https://docs.soliditylang.org/en/v0.8.0/introduction-to-smart-contracts.html)
- [Solidity Docs](https://docs.soliditylang.org/en/v0.8.0/)
- [Forge Docs](https://getfoundry.sh/forge/overview)
- [Forge Tests](https://getfoundry.sh/forge/tests/overview)
- [OpenZeppelin Upgrades](https://docs.openzeppelin.com/contracts/5.x/upgradeable)
- [OpenZeppelin Foundry Upgrades](https://github.com/OpenZeppelin/openzeppelin-foundry-upgrades)

## Questions?

If you have questions:

1. Check existing issues
2. Create a new issue with `question` label
3. Ask in your PR if you're working on code

Thank you for your contributions!

## License

The **EVMAuth** smart contract is released under the MIT License. See the [LICENSE](LICENSE) file for details.
