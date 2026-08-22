{
  description = "CV environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    adocweave.url = "github:KeishiS/adocweave?ref=v0.44.1";
  };

  outputs =
    {
      self,
      nixpkgs,
      adocweave,
    }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
      };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages =
          with pkgs;
          [
            pnpm
            nodejs_26

            typst
            typstyle
            typst-live
          ]
          ++ [
            adocweave.packages.${system}.default
          ];
        shellHook = ''
          export SHELL="${pkgs.zsh}"/bin/zsh
          exec ${pkgs.zsh}/bin/zsh
        '';
      };
    };
}
